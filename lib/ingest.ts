import { sql } from "./db";
import { fetchSeasonGames, isFbsGame, type CfbdGame } from "./cfbd";
import { VALID_WEEKS } from "./format";

const SEASON = 2026;

type TeamLookupRow = { id: number; cfbd_team_id: number | null };

async function resolveTeamId(cfbdTeamId: number, name: string): Promise<number> {
  const existing = await sql<TeamLookupRow[]>`
    SELECT id, cfbd_team_id FROM teams WHERE cfbd_team_id = ${cfbdTeamId}
  `;
  if (existing[0]) return existing[0].id;

  // Unknown to us -- almost certainly a non-FBS opponent, since all ~136 FBS
  // teams should already be seeded and ID-resolved. Auto-create it in the
  // generic 'FCS' bucket regardless of its real (FCS/D2/etc.) conference --
  // computeComputerRankings keys its opponent-strength logic on the literal
  // string "FCS", matching the original spreadsheet's "(FCS)" name-suffix
  // convention, not real conference names.
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO teams (cfbd_team_id, name, conference, is_fbs)
    VALUES (${cfbdTeamId}, ${name}, 'FCS', FALSE)
    ON CONFLICT (name) DO UPDATE SET cfbd_team_id = EXCLUDED.cfbd_team_id
    RETURNING id
  `;
  return inserted[0].id;
}

export type SeedWeekResult = { week: number; gamesUpserted: number };

// CFBD's 2026 calendar lumps the season-opening Aug 29 slate into the same
// "week 1" bucket as the following weekend's games (an 11-day window instead
// of the usual ~7), so a handful of teams play twice inside CFBD's week 1.
// Split anything before this date out into our own "week 0".
const WEEK_ZERO_CUTOFF_ET = "2026-09-01";
const etDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function resolveWeek(game: CfbdGame): number {
  if (game.week === 1) {
    const etDate = etDateFormatter.format(new Date(game.startDate));
    if (etDate < WEEK_ZERO_CUTOFF_ET) return 0;
  }
  return game.week;
}

/** Ingests weeks 0-15 from CFBD in one call (Week 16 is derived, not fetched). */
export async function seedSeasonFromCfbd(
  weeks: number[] = VALID_WEEKS.filter((w) => w !== 16),
): Promise<SeedWeekResult[]> {
  const allGames = await fetchSeasonGames(SEASON);
  const weekSet = new Set(weeks);
  const results = new Map<number, number>(weeks.map((w) => [w, 0]));

  for (const game of allGames) {
    if (!isFbsGame(game)) continue;
    const week = resolveWeek(game);
    if (!weekSet.has(week)) continue;
    await upsertGame(game, week);
    results.set(week, (results.get(week) ?? 0) + 1);
  }

  return weeks.map((week) => ({ week, gamesUpserted: results.get(week) ?? 0 }));
}

async function upsertGame(game: CfbdGame, week: number): Promise<void> {
  const homeTeamId = await resolveTeamId(game.homeId, game.homeTeam);
  const awayTeamId = await resolveTeamId(game.awayId, game.awayTeam);
  const status = game.completed ? "final" : "scheduled";

  // team1 = home, team2 = away by convention.
  await sql`
    INSERT INTO games (
      cfbd_game_id, season, week, team1_id, team2_id,
      team1_is_home, is_neutral_site, kickoff_at, kickoff_tbd, status
    )
    VALUES (
      ${String(game.id)}, ${game.season}, ${week}, ${homeTeamId}, ${awayTeamId},
      TRUE, ${game.neutralSite}, ${game.startDate}, ${game.startTimeTBD === true}, ${status}
    )
    ON CONFLICT (cfbd_game_id) DO UPDATE SET
      week = EXCLUDED.week,
      kickoff_at = EXCLUDED.kickoff_at,
      kickoff_tbd = EXCLUDED.kickoff_tbd,
      status = EXCLUDED.status
  `;
}
