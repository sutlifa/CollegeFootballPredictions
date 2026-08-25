import { sql } from "./db";
import type { Game, GameStatus, Team } from "./types";

const SEASON = 2026;

type TeamRow = {
  id: number;
  cfbd_team_id: number | null;
  name: string;
  conference: string;
  preseason_rank: number | null;
  logo_url: string | null;
  is_fbs: boolean;
};

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    cfbdTeamId: row.cfbd_team_id,
    name: row.name,
    conference: row.conference,
    preseasonRank: row.preseason_rank,
    logoUrl: row.logo_url,
    isFbs: row.is_fbs,
  };
}

type GameRow = {
  id: number;
  cfbd_game_id: string | null;
  season: number;
  week: number;
  team1_id: number;
  team2_id: number;
  team1_is_home: boolean | null;
  is_neutral_site: boolean;
  conference: string | null;
  is_conference_championship: boolean;
  kickoff_at: string | null;
  status: GameStatus;
  predicted_score_team1: number | null;
  predicted_score_team2: number | null;
  actual_score_team1: number | null;
  actual_score_team2: number | null;
};

function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    cfbdGameId: row.cfbd_game_id,
    season: row.season,
    week: row.week,
    team1Id: row.team1_id,
    team2Id: row.team2_id,
    team1IsHome: row.team1_is_home,
    isNeutralSite: row.is_neutral_site,
    conference: row.conference,
    isConferenceChampionship: row.is_conference_championship,
    kickoffAt: row.kickoff_at,
    status: row.status,
    predictedScoreTeam1: row.predicted_score_team1,
    predictedScoreTeam2: row.predicted_score_team2,
    actualScoreTeam1: row.actual_score_team1,
    actualScoreTeam2: row.actual_score_team2,
  };
}

export async function getAllTeams(): Promise<Team[]> {
  const rows = await sql<TeamRow[]>`SELECT * FROM teams ORDER BY name`;
  return rows.map(mapTeam);
}

// Every game query below returns shared games (weeks 1-15, user_id IS NULL)
// plus this user's own Week 16 rows, left-joined against this user's
// predictions -- another user's predictions or Week 16 pairing never leaks
// into the result.
export async function getAllGames(
  userId: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT g.*, p.predicted_score_team1, p.predicted_score_team2
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND (g.user_id IS NULL OR g.user_id = ${userId})
    ORDER BY g.week, g.id
  `;
  return rows.map(mapGame);
}

export async function getGamesForWeek(
  week: number,
  userId: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT g.*, p.predicted_score_team1, p.predicted_score_team2
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND g.week = ${week}
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
    ORDER BY g.id
  `;
  return rows.map(mapGame);
}

export async function getGamesForWeeks(
  weeks: number[],
  userId: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT g.*, p.predicted_score_team1, p.predicted_score_team2
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND g.week = ANY(${weeks})
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
    ORDER BY g.week, g.id
  `;
  return rows.map(mapGame);
}

export async function savePrediction(
  userId: number,
  gameId: number,
  score1: number,
  score2: number,
): Promise<void> {
  if (score1 === score2) {
    throw new Error("Predicted scores cannot be tied");
  }
  await sql`
    INSERT INTO predictions (user_id, game_id, predicted_score_team1, predicted_score_team2)
    VALUES (${userId}, ${gameId}, ${score1}, ${score2})
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      predicted_score_team1 = EXCLUDED.predicted_score_team1,
      predicted_score_team2 = EXCLUDED.predicted_score_team2,
      updated_at = now()
  `;
}

export async function clearPrediction(
  userId: number,
  gameId: number,
): Promise<void> {
  await sql`DELETE FROM predictions WHERE user_id = ${userId} AND game_id = ${gameId}`;
}

export async function upsertWeek16Game(
  userId: number,
  conference: string,
  team1Id: number,
  team2Id: number,
  season = SEASON,
): Promise<void> {
  // The conflict target must repeat the partial index's WHERE clause
  // (games_peruser_unique) -- Postgres won't use a partial unique index as
  // an ON CONFLICT arbiter unless the predicate matches exactly, otherwise
  // it fails with "no unique or exclusion constraint matching the ON
  // CONFLICT specification" even when there's no actual conflicting row.
  await sql`
    INSERT INTO games (season, week, team1_id, team2_id, conference, is_conference_championship, is_neutral_site, user_id)
    VALUES (${season}, 16, ${team1Id}, ${team2Id}, ${conference}, TRUE, TRUE, ${userId})
    ON CONFLICT (season, week, team1_id, team2_id, user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET conference = EXCLUDED.conference, is_conference_championship = TRUE, is_neutral_site = TRUE
  `;
}

export async function deleteStaleWeek16Game(
  userId: number,
  conference: string,
  keepTeam1Id: number,
  keepTeam2Id: number,
  season = SEASON,
): Promise<void> {
  // Deletes cascade predictions for the stale row too (ON DELETE CASCADE),
  // so a prediction that belonged to a since-replaced matchup doesn't
  // silently carry over onto whichever teams take its place.
  await sql`
    DELETE FROM games
    WHERE season = ${season} AND week = 16 AND user_id = ${userId} AND conference = ${conference}
      AND NOT (team1_id = ${keepTeam1Id} AND team2_id = ${keepTeam2Id})
  `;
}

export async function getBracketField(
  userId: number,
  season = SEASON,
): Promise<number[] | null> {
  const rows = await sql<
    { team_ids: number[] }[]
  >`SELECT team_ids FROM bracket_field WHERE season = ${season} AND user_id = ${userId}`;
  return rows[0]?.team_ids ?? null;
}

export async function setBracketField(
  userId: number,
  teamIds: number[],
  season = SEASON,
): Promise<void> {
  if (teamIds.length !== 12) {
    throw new Error(`Bracket field must have exactly 12 teams, got ${teamIds.length}`);
  }
  await sql`
    INSERT INTO bracket_field (season, user_id, team_ids, updated_at)
    VALUES (${season}, ${userId}, ${teamIds}, now())
    ON CONFLICT (season, user_id) DO UPDATE SET team_ids = EXCLUDED.team_ids, updated_at = now()
  `;
}

export async function clearBracketField(
  userId: number,
  season = SEASON,
): Promise<void> {
  await sql`DELETE FROM bracket_field WHERE season = ${season} AND user_id = ${userId}`;
}
