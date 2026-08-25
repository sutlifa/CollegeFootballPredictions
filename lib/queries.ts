import { sql } from "./db";
import type { Game, GameStatus, Team } from "./types";

const SEASON = 2026;

type TeamRow = {
  id: number;
  espn_team_id: number | null;
  name: string;
  conference: string;
  preseason_rank: number | null;
  is_fbs: boolean;
};

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    espnTeamId: row.espn_team_id,
    name: row.name,
    conference: row.conference,
    preseasonRank: row.preseason_rank,
    isFbs: row.is_fbs,
  };
}

type GameRow = {
  id: number;
  espn_event_id: string | null;
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
    espnEventId: row.espn_event_id,
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

export async function getAllGames(season = SEASON): Promise<Game[]> {
  const rows = await sql<
    GameRow[]
  >`SELECT * FROM games WHERE season = ${season} ORDER BY week, id`;
  return rows.map(mapGame);
}

export async function getGamesForWeek(
  week: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT * FROM games WHERE season = ${season} AND week = ${week} ORDER BY id
  `;
  return rows.map(mapGame);
}

export async function getGamesForWeeks(
  weeks: number[],
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT * FROM games WHERE season = ${season} AND week = ANY(${weeks}) ORDER BY week, id
  `;
  return rows.map(mapGame);
}

export async function savePrediction(
  gameId: number,
  score1: number,
  score2: number,
): Promise<void> {
  if (score1 === score2) {
    throw new Error("Predicted scores cannot be tied");
  }
  await sql`
    UPDATE games
    SET predicted_score_team1 = ${score1},
        predicted_score_team2 = ${score2},
        updated_at = now()
    WHERE id = ${gameId}
  `;
}

export async function upsertWeek16Game(
  conference: string,
  team1Id: number,
  team2Id: number,
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO games (season, week, team1_id, team2_id, conference, is_conference_championship)
    VALUES (${season}, 16, ${team1Id}, ${team2Id}, ${conference}, TRUE)
    ON CONFLICT (season, week, team1_id, team2_id)
    DO UPDATE SET conference = EXCLUDED.conference, is_conference_championship = TRUE
  `;
}

export async function clearWeek16GameForConference(
  conference: string,
  season = SEASON,
): Promise<void> {
  // Reset predictions on the old pairing rather than deleting the row, so a
  // stale championship-week matchup that no longer matches who's actually in
  // it doesn't silently keep a prediction that belonged to different teams.
  await sql`
    UPDATE games
    SET predicted_score_team1 = NULL, predicted_score_team2 = NULL
    WHERE season = ${season} AND week = 16 AND conference = ${conference}
  `;
}

export async function deleteStaleWeek16Game(
  conference: string,
  keepTeam1Id: number,
  keepTeam2Id: number,
  season = SEASON,
): Promise<void> {
  await sql`
    DELETE FROM games
    WHERE season = ${season} AND week = 16 AND conference = ${conference}
      AND NOT (team1_id = ${keepTeam1Id} AND team2_id = ${keepTeam2Id})
  `;
}

export async function getBracketField(
  season = SEASON,
): Promise<number[] | null> {
  const rows = await sql<
    { team_ids: number[] }[]
  >`SELECT team_ids FROM bracket_field WHERE season = ${season}`;
  return rows[0]?.team_ids ?? null;
}

export async function setBracketField(
  teamIds: number[],
  season = SEASON,
): Promise<void> {
  if (teamIds.length !== 12) {
    throw new Error(`Bracket field must have exactly 12 teams, got ${teamIds.length}`);
  }
  await sql`
    INSERT INTO bracket_field (season, team_ids, updated_at)
    VALUES (${season}, ${teamIds}, now())
    ON CONFLICT (season) DO UPDATE SET team_ids = EXCLUDED.team_ids, updated_at = now()
  `;
}

export async function clearBracketField(season = SEASON): Promise<void> {
  await sql`DELETE FROM bracket_field WHERE season = ${season}`;
}
