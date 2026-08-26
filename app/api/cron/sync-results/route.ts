import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchSeasonGames, type CfbdGame } from "@/lib/cfbd";
import { VALID_WEEKS } from "@/lib/format";
import { seedSeasonFromCfbd } from "@/lib/ingest";

export const maxDuration = 60;

const SEASON = 2026;

async function syncGame(game: CfbdGame): Promise<number> {
  if (!game.completed || game.homePoints === null || game.awayPoints === null) {
    return 0;
  }

  // Weeks 1-15: matched directly by the cfbd_game_id set during ingestion.
  const result = await sql`
    UPDATE games
    SET actual_score_team1 = ${game.homePoints},
        actual_score_team2 = ${game.awayPoints},
        status = 'final',
        updated_at = now()
    WHERE cfbd_game_id = ${String(game.id)}
  `;
  if (result.count > 0) return result.count;

  // Week 16: our rows are self-derived with no cfbd_game_id yet. Try to
  // reconcile by matching the real championship-game team pair against an
  // undecided week-16 row, then backfill cfbd_game_id for future runs.
  const homeTeamId = await sql<{ id: number }[]>`
    SELECT id FROM teams WHERE cfbd_team_id = ${game.homeId}
  `;
  const awayTeamId = await sql<{ id: number }[]>`
    SELECT id FROM teams WHERE cfbd_team_id = ${game.awayId}
  `;
  if (!homeTeamId[0] || !awayTeamId[0]) return 0;

  const reconciled = await sql`
    UPDATE games
    SET cfbd_game_id = ${String(game.id)},
        actual_score_team1 = ${game.homePoints},
        actual_score_team2 = ${game.awayPoints},
        status = 'final',
        updated_at = now()
    WHERE season = ${SEASON} AND week = 16 AND cfbd_game_id IS NULL
      AND ((team1_id = ${homeTeamId[0].id} AND team2_id = ${awayTeamId[0].id})
        OR (team1_id = ${awayTeamId[0].id} AND team2_id = ${homeTeamId[0].id}))
  `;
  return reconciled.count;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let gamesUpdated = 0;
  let gamesUpserted = 0;
  let error: string | null = null;
  const weeksChecked = VALID_WEEKS;

  try {
    const games = await fetchSeasonGames(SEASON);
    for (const game of games) {
      gamesUpdated += await syncGame(game);
    }

    // CFBD's schedule for a future season fills in gradually -- a team can
    // have fewer games listed than its real slate simply because some
    // haven't been finalized/published yet this far out. Re-running the
    // same upsert-by-cfbd_game_id ingestion every day picks up any newly-
    // published games automatically; it's a no-op for games we already
    // have (ON CONFLICT just updates kickoff/status/week).
    const seedResults = await seedSeasonFromCfbd();
    gamesUpserted = seedResults.reduce((sum, r) => sum + r.gamesUpserted, 0);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error("[sync-results]", error);
  }

  await sql`
    INSERT INTO sync_runs (weeks_checked, games_updated, error)
    VALUES (${weeksChecked}, ${gamesUpdated}, ${error})
  `;

  return NextResponse.json({ gamesUpdated, gamesUpserted, error });
}
