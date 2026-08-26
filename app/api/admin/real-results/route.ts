import { NextRequest, NextResponse } from "next/server";
import { PLAYOFF_ROUNDS, type PlayoffRound } from "@/lib/postseasonBonus";
import {
  setRealConferenceResult,
  setRealNationalChampion,
  setRealPlayoffRound,
} from "@/lib/queries";

/**
 * Manual entry point for real-world postseason ground truth -- there's no
 * API for an actual human selection committee's decisions, so the site
 * admin enters these as results become known. Feeds the Leaderboard's
 * end-of-season bonus scoring (lib/postseasonBonus.ts); never shown as a
 * game users predict against.
 *
 * Body shapes (discriminated by `type`):
 *   { type: "conference", conference: string, championTeamId: number, runnerUpTeamId: number }
 *   { type: "playoffRound", round: "field"|"quarterfinal"|"semifinal"|"championship", teamIds: number[] }
 *   { type: "nationalChampion", teamId: number }
 */
export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.type === "conference") {
    const { conference, championTeamId, runnerUpTeamId } = body;
    if (
      typeof conference !== "string" ||
      typeof championTeamId !== "number" ||
      typeof runnerUpTeamId !== "number"
    ) {
      return NextResponse.json({ error: "Invalid conference payload" }, { status: 400 });
    }
    await setRealConferenceResult(conference, championTeamId, runnerUpTeamId);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "playoffRound") {
    const { round, teamIds } = body;
    if (
      !PLAYOFF_ROUNDS.includes(round as PlayoffRound) ||
      !Array.isArray(teamIds) ||
      !teamIds.every((id) => typeof id === "number")
    ) {
      return NextResponse.json(
        { error: `round must be one of ${PLAYOFF_ROUNDS.join(", ")}, teamIds must be number[]` },
        { status: 400 },
      );
    }
    await setRealPlayoffRound(round, teamIds);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "nationalChampion") {
    const { teamId } = body;
    if (typeof teamId !== "number") {
      return NextResponse.json({ error: "teamId must be a number" }, { status: 400 });
    }
    await setRealNationalChampion(teamId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "type must be one of: conference, playoffRound, nationalChampion" },
    { status: 400 },
  );
}
