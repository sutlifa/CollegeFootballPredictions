"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { BracketSlot } from "@/lib/bracket";
import { SLOTS_BY_ROUND } from "@/lib/bracket";
import {
  clearBracketField,
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
  revalidatePath("/bracket");
}
