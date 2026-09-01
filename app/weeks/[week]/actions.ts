"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { finalizeConferenceStandingsIfReady } from "@/lib/conferenceTiebreakers";
import { isMarginBucketId } from "@/lib/margin";
import {
  clearPrediction,
  clearWeekPredictions,
  fillWeekDefaults,
  savePrediction,
  syncWeekSubmission,
} from "@/lib/queries";

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
async function settleWeek(userId: number, week: number) {
  await syncWeekSubmission(userId, week);
  await finalizeConferenceStandingsIfReady(userId);
  revalidateAllAffected(week);
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
  await fillWeekDefaults(userId, week);
  await settleWeek(userId, week);
}
