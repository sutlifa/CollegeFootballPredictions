"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { finalizeConferenceStandingsIfReady } from "@/lib/conferenceTiebreakers";
import { isMarginBucketId } from "@/lib/margin";
import {
  clearBracketField,
  clearPrediction,
  clearWeekPredictions,
  fillWeekDefaults,
  getBracketField,
  savePrediction,
  syncWeekSubmission,
  WeekLockedError,
} from "@/lib/queries";
import { syncWeek16Games } from "@/lib/syncWeek16";

function revalidateAllAffected(week: number) {
  revalidatePath(`/weeks/${week}`);
  revalidatePath("/standings");
  revalidatePath("/rankings");
  revalidatePath("/bracket");
  revalidatePath("/leaderboard");
  // Both teams in the game have a season page showing this pick. The pick
  // itself doesn't say which teams those are, so revalidate the segment.
  revalidatePath("/teams/[teamId]", "page");
  revalidatePath("/");
}

/**
 * What every write on this page resolves to. `error` is read by the person
 * holding the phone, so it is always a sentence they can act on.
 *
 * These actions RETURN failures instead of throwing them. A thrown error
 * reaches the browser with its message swapped for a digest in production,
 * so "This week is locked" and "you've been signed out" -- the two things
 * a person actually needs to be told -- arrived as the generic error
 * screen, headed "Couldn't save that prediction" whatever had happened.
 * Anything unexpected is logged here under an UPPERCASE label and reported
 * as a plain "try again"; the route's error.tsx is left for failures of
 * the page itself.
 */
export type WeekActionResult = { error?: string };

const SIGNED_OUT: WeekActionResult = {
  error: "You've been signed out. Sign in again, then retry.",
};

/**
 * Runs one write for the signed-in user and turns every failure into a
 * WeekActionResult. `label` is the server-log prefix; `fallback` is what
 * the person sees when the cause is not one they can do anything about.
 */
async function runWeekAction(
  label: string,
  fallback: string,
  write: (userId: number) => Promise<string | void>,
): Promise<WeekActionResult> {
  const session = await auth();
  if (!session?.user?.id) return SIGNED_OUT;
  try {
    const invalid = await write(session.user.id);
    return invalid ? { error: invalid } : {};
  } catch (err) {
    if (err instanceof WeekLockedError) return { error: err.message };
    console.error(`${label}:`, err);
    return { error: fallback };
  }
}

/**
 * A week submits itself as soon as every game in it has a pick, and
 * un-submits if a pick is cleared -- so there's no separate button to
 * remember, and editing one game in a finished week silently re-submits it
 * rather than dropping the whole week out of the rankings.
 */
/**
 * Everything downstream of a changed pick, in dependency order.
 *
 * A pick feeds the standings, the standings decide the championship
 * matchups, and the champions decide who has an automatic playoff bid --
 * so a change early in that chain has to be carried all the way down. It
 * wasn't: editing week 5 left week 16 showing the two teams that used to
 * top the conference, and the only way to get the right ones was to clear
 * the championship week by hand.
 *
 * Order matters. The frozen standings are cleared and recomputed first,
 * because deriveWeek16Matchups reads them; deriving before that would pair
 * teams off the stale table.
 *
 * A changed matchup invalidates a confirmed playoff field, because the old
 * matchup's pick is deleted with it and that conference no longer has a
 * champion holding its automatic bid. Only cleared when a field actually
 * exists and something actually moved -- an edit that leaves every
 * conference's top two alone touches nothing.
 */
async function settleWeek(userId: number, week: number) {
  await syncWeekSubmission(userId, week);
  await finalizeConferenceStandingsIfReady(userId);

  let bracketInvalidated = false;
  if (week === 16) {
    // The title games themselves decide the champions, so editing one can
    // change who holds an automatic bid without any matchup moving.
    if (await getBracketField(userId)) {
      await clearBracketField(userId);
      bracketInvalidated = true;
    }
  } else {
    const { changedConferences } = await syncWeek16Games(userId);
    if (changedConferences.length > 0 && (await getBracketField(userId))) {
      await clearBracketField(userId);
      bracketInvalidated = true;
    }
  }

  revalidateAllAffected(week);
  if (bracketInvalidated) revalidatePath("/bracket");
}

export async function savePredictionAction(
  formData: FormData,
): Promise<WeekActionResult> {
  return runWeekAction(
    "SAVE PREDICTION ERROR",
    "That pick didn't save. Please try again.",
    async (userId) => {
      const gameId = Number(formData.get("gameId"));
      const winnerTeamId = Number(formData.get("winnerTeamId"));
      const marginBucket = Number(formData.get("marginBucket"));
      const week = Number(formData.get("week"));

      if (Number.isNaN(gameId) || Number.isNaN(winnerTeamId)) {
        return "That pick didn't make sense. Reload the page and try again.";
      }
      if (!isMarginBucketId(marginBucket)) {
        return "Pick how big the margin of victory will be.";
      }

      await savePrediction(userId, gameId, winnerTeamId, marginBucket);
      await settleWeek(userId, week);
    },
  );
}

export async function clearPredictionAction(
  formData: FormData,
): Promise<WeekActionResult> {
  return runWeekAction(
    "CLEAR PREDICTION ERROR",
    "That pick didn't clear. Please try again.",
    async (userId) => {
      const gameId = Number(formData.get("gameId"));
      const week = Number(formData.get("week"));
      if (Number.isNaN(gameId)) {
        return "That game didn't make sense. Reload the page and try again.";
      }

      await clearPrediction(userId, gameId);
      await settleWeek(userId, week);
    },
  );
}

/**
 * Wipe a whole week. The lock is enforced in clearWeekPredictions, not
 * here, so a stale page or a hand-rolled post can't get round it either.
 */
export async function clearWeekAction(
  formData: FormData,
): Promise<WeekActionResult> {
  return runWeekAction(
    "CLEAR WEEK ERROR",
    "Couldn't clear this week. Please try again.",
    async (userId) => {
      const week = Number(formData.get("week"));
      if (!Number.isInteger(week)) {
        return "That week didn't make sense. Reload the page and try again.";
      }
      // "keep" leaves the filled defaults in place and removes only the
      // picks this person actually made.
      const keepDefaults = formData.get("keepDefaults") === "1";
      await clearWeekPredictions(userId, week, { keepDefaults });
      await settleWeek(userId, week);
    },
  );
}

/**
 * Fill the games this user hasn't picked with the favourite. Adds only --
 * an existing pick is never overwritten -- and refuses a locked week in
 * fillWeekDefaults rather than here.
 *
 * "settled" fills only the games the rank gap calls one-sided, which is the
 * same pass that runs automatically the first time a week is opened. It
 * needs to be reachable on demand too: once a week has been cleared that
 * automatic pass is spent, and without this the only remaining offer was
 * to fill every game including the close ones -- which is precisely the
 * thing the settled/close split exists to avoid doing to someone.
 */
export async function fillWeekDefaultsAction(
  formData: FormData,
): Promise<WeekActionResult> {
  return runWeekAction(
    "FILL WEEK ERROR",
    "Couldn't fill this week. Please try again.",
    async (userId) => {
      const week = Number(formData.get("week"));
      if (!Number.isInteger(week)) {
        return "That week didn't make sense. Reload the page and try again.";
      }
      const settledOnly = formData.get("settledOnly") === "1";
      await fillWeekDefaults(userId, week, { settledOnly });
      await settleWeek(userId, week);
    },
  );
}
