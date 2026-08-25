"use server";

import { revalidatePath } from "next/cache";
import { savePrediction } from "@/lib/queries";

export async function savePredictionAction(formData: FormData) {
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
    throw new Error("Predicted scores cannot be tied");
  }

  await savePrediction(gameId, score1, score2);
  revalidatePath(`/weeks/${week}`);
  revalidatePath("/standings");
  revalidatePath("/rankings");
  revalidatePath("/bracket");
  revalidatePath("/");
}
