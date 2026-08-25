import { sql } from "./db";
import { fetchWeekScoreboard, getCompetitors, isGameFinal } from "./espn";

const SEASON = 2026;

type TeamLookupRow = { id: number; espn_team_id: number | null };

async function resolveTeamId(espnTeamId: number, espnDisplayName: string): Promise<number> {
  const existing = await sql<TeamLookupRow[]>`
    SELECT id, espn_team_id FROM teams WHERE espn_team_id = ${espnTeamId}
  `;
  if (existing[0]) return existing[0].id;

  // Unknown to us -- almost certainly an FCS opponent, since all ~136 FBS
  // teams should already be seeded and ID-resolved. Auto-create it.
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO teams (espn_team_id, name, conference, is_fbs)
    VALUES (${espnTeamId}, ${espnDisplayName}, 'FCS', FALSE)
    ON CONFLICT (name) DO UPDATE SET espn_team_id = EXCLUDED.espn_team_id
    RETURNING id
  `;
  return inserted[0].id;
}

function shortName(team: { location: string; displayName: string }): string {
  // ESPN's `location` (e.g. "Idaho State") reads far closer to our naming
  // convention than `displayName` (e.g. "Idaho State Bengals").
  return team.location || team.displayName;
}

export type SeedWeekResult = { week: number; gamesUpserted: number };

/** Ingests one week's ESPN schedule (weeks 1-15 only -- Week 16 is derived, not fetched). */
export async function seedWeekFromEspn(
  week: number,
  opts: { dates?: string } = {},
): Promise<SeedWeekResult> {
  if (week < 1 || week > 15) {
    throw new Error("Only weeks 1-15 are seeded from ESPN; week 16 is derived from standings");
  }

  const { events } = await fetchWeekScoreboard(week, opts);
  let gamesUpserted = 0;

  for (const event of events) {
    const { home, away } = getCompetitors(event);
    if (!home || !away) continue;

    const homeTeamId = await resolveTeamId(Number(home.team.id), shortName(home.team));
    const awayTeamId = await resolveTeamId(Number(away.team.id), shortName(away.team));
    const neutral = event.competitions[0]?.neutralSite ?? false;
    const status = isGameFinal(event) ? "final" : "scheduled";

    // team1 = home, team2 = away by convention (unless neutral site, where
    // ESPN still labels one competitor "home" for scheduling purposes only).
    await sql`
      INSERT INTO games (
        espn_event_id, season, week, team1_id, team2_id,
        team1_is_home, is_neutral_site, kickoff_at, status
      )
      VALUES (
        ${event.id}, ${SEASON}, ${week}, ${homeTeamId}, ${awayTeamId},
        TRUE, ${neutral}, ${event.date}, ${status}
      )
      ON CONFLICT (espn_event_id) DO UPDATE SET
        kickoff_at = EXCLUDED.kickoff_at,
        status = EXCLUDED.status
    `;
    gamesUpserted++;
  }

  return { week, gamesUpserted };
}
