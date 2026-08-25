import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchWeekScoreboard, getCompetitors, isGameFinal } from "@/lib/espn";

export const maxDuration = 60;

const SEASON = 2026;

async function syncWeek(week: number): Promise<number> {
  const { events } = await fetchWeekScoreboard(week);
  let updated = 0;

  for (const event of events) {
    if (!isGameFinal(event)) continue;
    const { home, away } = getCompetitors(event);
    if (!home?.score || !away?.score) continue;

    // Weeks 1-15: matched directly by the espn_event_id set during ingestion.
    const result = await sql`
      UPDATE games
      SET actual_score_team1 = ${Number(home.score)},
          actual_score_team2 = ${Number(away.score)},
          status = 'final',
          updated_at = now()
      WHERE espn_event_id = ${event.id}
    `;
    if (result.count > 0) {
      updated += result.count;
      continue;
    }

    // Week 16: our rows are self-derived with no espn_event_id yet. Try to
    // reconcile by matching the real championship-game team pair against an
    // undecided week-16 row, then backfill espn_event_id for future runs.
    const homeTeamId = await sql<{ id: number }[]>`
      SELECT id FROM teams WHERE espn_team_id = ${Number(home.team.id)}
    `;
    const awayTeamId = await sql<{ id: number }[]>`
      SELECT id FROM teams WHERE espn_team_id = ${Number(away.team.id)}
    `;
    if (!homeTeamId[0] || !awayTeamId[0]) continue;

    const reconciled = await sql`
      UPDATE games
      SET espn_event_id = ${event.id},
          actual_score_team1 = ${Number(home.score)},
          actual_score_team2 = ${Number(away.score)},
          status = 'final',
          updated_at = now()
      WHERE season = ${SEASON} AND week = 16 AND espn_event_id IS NULL
        AND ((team1_id = ${homeTeamId[0].id} AND team2_id = ${awayTeamId[0].id})
          OR (team1_id = ${awayTeamId[0].id} AND team2_id = ${homeTeamId[0].id}))
    `;
    updated += reconciled.count;
  }

  return updated;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = Array.from({ length: 16 }, (_, i) => i + 1);
  let gamesUpdated = 0;
  let error: string | null = null;

  for (const week of weeks) {
    try {
      gamesUpdated += await syncWeek(week);
    } catch (err) {
      error = `week ${week}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[sync-results]", error);
    }
  }

  await sql`
    INSERT INTO sync_runs (weeks_checked, games_updated, error)
    VALUES (${weeks}, ${gamesUpdated}, ${error})
  `;

  return NextResponse.json({ gamesUpdated, error });
}
