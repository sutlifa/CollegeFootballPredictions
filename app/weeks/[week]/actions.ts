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

async function requireUserId(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not signed in");
  }
  return session.user.id;
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

export async function savePredictionAction(formData: FormData) {
  const userId = await requireUserId();
  const gameId = Number(formData.get("gameId"));
  const winnerTeamId = Number(formData.get("winnerTeamId"));
  const marginBucket = Number(formData.get("marginBucket"));
  const week = Number(formData.get("week"));

  if (Number.isNaN(gameId) || Number.isNaN(winnerTeamId)) {
    throw new Error("Invalid prediction");
  }
  if (!isMarginBucketId(marginBucket)) {
    throw new Error("Pick how big the margin of victory will be.");
  }

  await savePrediction(userId, gameId, winnerTeamId, marginBucket);
  await settleWeek(userId, week);
}

export async function clearPredictionAction(formData: FormData) {
  const userId = await requireUserId();
  const gameId = Number(formData.get("gameId"));
  const week = Number(formData.get("week"));
  if (Number.isNaN(gameId)) {
    throw new Error("Invalid game");
  }

  await clearPrediction(userId, gameId);
  await settleWeek(userId, week);
}

/**
 * Wipe a whole week. The lock is enforced in clearWeekPredictions, not
 * here, so a stale page or a hand-rolled post can't get round it either.
 */
export async function clearWeekAction(formData: FormData) {
  const userId = await requireUserId();
  const week = Number(formData.get("week"));
  if (!Number.isInteger(week)) {
    throw new Error("Invalid week");
  }
  // "keep" leaves the filled defaults in place and removes only the picks
  // this person actually made.
  const keepDefaults = formData.get("keepDefaults") === "1";
  await clearWeekPredictions(userId, week, { keepDefaults });
  await settleWeek(userId, week);
}

/**
 * Fill the games this user hasn't picked with the favourite. Adds only --
 * an existing pick is never overwritten -- and refuses a locked week in
 * fillWeekDefaults rather than here.
 */
export async function fillWeekDefaultsAction(formData: FormData) {
  const userId = await requireUserId();
  const week = Number(formData.get("week"));
  if (!Number.isInteger(week)) {
    throw new Error("Invalid week");
  }
  await fillWeekDefaults(userId, week, { settledOnly: false });
  await settleWeek(userId, week);
}
