"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { BracketRound, BracketSlot } from "@/lib/bracket";
import {
  BRACKET_ROUNDS,
  SLOTS_BY_ROUND,
  slotsFromRoundOnward,
} from "@/lib/bracket";
import {
  clearBracketField,
  clearBracketPicksForSlots,
  saveBracketRoundPicks,
  setBracketField,
} from "@/lib/queries";

async function requireUserId(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not signed in");
  }
  return session.user.id;
}

export async function setBracketFieldAction(formData: FormData) {
  const userId = await requireUserId();
  const teamIds = formData
    .getAll("teamIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  if (teamIds.length !== 12) {
    throw new Error(
      `Select exactly 12 teams for the playoff field (got ${teamIds.length})`,
    );
  }

  await setBracketField(userId, teamIds);
  revalidatePath("/bracket");
}

export async function resetBracketFieldAction() {
  const userId = await requireUserId();
  await clearBracketField(userId);
  revalidatePath("/bracket");
}

/**
 * "Edit this round": throws away every pick in it AND in every round after
 * it, then sends the user back to the bracket.
 *
 * The clearing happens HERE, on the way in, not when the re-picked round is
 * saved. That is the whole design: with the round emptied,
 * currentBracketRound lands on it unaided, so there is no "which round am I
 * editing" parameter to carry, nothing to strip off the URL afterwards, and
 * no way for the page to sit on a round it has already saved. It also means
 * a half-finished edit cannot leave later rounds holding picks made against
 * a bracket that no longer exists.
 */
export async function editRoundAction(formData: FormData) {
  const userId = await requireUserId();
  const round = formData.get("round") as string;
  if (!BRACKET_ROUNDS.includes(round as BracketRound)) {
    throw new Error(`Invalid round: ${round}`);
  }
  await clearBracketPicksForSlots(
    userId,
    slotsFromRoundOnward(round as BracketRound),
  );
  revalidatePath("/bracket");
  redirect("/bracket");
}

/**
 * Saves every slot's pick for one round at once (formData has one
 * `pick_<slot>` field per game in that round). Validates every game in the
 * round actually got a pick before writing anything.
 */
export async function saveRoundPicksAction(formData: FormData) {
  const userId = await requireUserId();
  const round = formData.get("round") as string;
  const slots = SLOTS_BY_ROUND[round as keyof typeof SLOTS_BY_ROUND];
  if (!slots) {
    throw new Error(`Invalid round: ${round}`);
  }

  const picks: { slot: BracketSlot; teamId: number }[] = [];
  for (const slot of slots) {
    const raw = formData.get(`pick_${slot}`);
    const teamId = Number(raw);
    if (!raw || Number.isNaN(teamId)) {
      throw new Error(`Missing a pick for every game in this round`);
    }
    picks.push({ slot, teamId });
  }

  await saveBracketRoundPicks(userId, picks);
  // No redirect needed: the page has no "which round" parameter to shed any
  // more. It renders the first unfinished round, so saving this one is what
  // moves it on.
  revalidatePath("/bracket");
}
