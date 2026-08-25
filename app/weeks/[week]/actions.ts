"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { clearPrediction, savePrediction, submitWeek } from "@/lib/queries";

function revalidateAllAffected(week: number) {
  revalidatePath(`/weeks/${week}`);
  revalidatePath("/standings");
  revalidatePath("/rankings");
  revalidatePath("/bracket");
  revalidatePath("/");
}

async function requireUserId(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not signed in");
  }
  return session.user.id;
}

export async function savePredictionAction(formData: FormData) {
  const userId = await requireUserId();
  const gameId = Number(formData.get("gameId"));
  const score1 = Number(formData.get("score1"));
  const score2 = Number(formData.get("score2"));
  const week = Number(formData.get("week"));

  if (
    Number.isNaN(gameId) ||
    Number.isNaN(score1) ||
    Number.isNaN(score2) ||
    score1 < 0 ||
    score2 < 0
  ) {
    throw new Error("Invalid prediction");
  }
  if (score1 === score2) {
    throw new Error(
      "Predicted scores can't be tied -- college football games don't end in a tie. Use Clear if you want to remove this prediction.",
    );
  }

  await savePrediction(userId, gameId, score1, score2);
  revalidateAllAffected(week);
}

export async function clearPredictionAction(formData: FormData) {
  const userId = await requireUserId();
  const gameId = Number(formData.get("gameId"));
  const week = Number(formData.get("week"));
  if (Number.isNaN(gameId)) {
    throw new Error("Invalid game");
  }

  await clearPrediction(userId, gameId);
  revalidateAllAffected(week);
}

export async function submitWeekAction(formData: FormData) {
  const userId = await requireUserId();
  const week = Number(formData.get("week"));
  if (Number.isNaN(week)) {
    throw new Error("Invalid week");
  }

  await submitWeek(userId, week);
  revalidateAllAffected(week);
}
