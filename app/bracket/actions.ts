"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { clearBracketField, setBracketField } from "@/lib/queries";

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
