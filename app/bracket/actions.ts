"use server";

import { revalidatePath } from "next/cache";
import { clearBracketField, setBracketField } from "@/lib/queries";

export async function setBracketFieldAction(formData: FormData) {
  const teamIds = formData
    .getAll("teamIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  if (teamIds.length !== 12) {
    throw new Error(
      `Select exactly 12 teams for the playoff field (got ${teamIds.length})`,
    );
  }

  await setBracketField(teamIds);
  revalidatePath("/bracket");
}

export async function resetBracketFieldAction() {
  await clearBracketField();
  revalidatePath("/bracket");
}
