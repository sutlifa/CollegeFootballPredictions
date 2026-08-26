import { conferenceDivisionKey } from "./conferences";
import { sql } from "./db";
import { formatDisplayName, type LeaderboardRow } from "./leaderboard";
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

async function unsubmitWeekForGame(userId: number, gameId: number): Promise<void> {
  // If this game's week was already submitted, editing its prediction
  // un-submits that week -- Computer Rankings must not silently pick up a
  // changed score until the user explicitly re-submits.
  await sql`
    DELETE FROM week_submissions
    WHERE user_id = ${userId}
      AND (season, week) IN (SELECT season, week FROM games WHERE id = ${gameId})
  `;
  // Any finalized conference tiebreaker order was computed from a set of
  // results that just changed -- wipe it rather than let it go stale. It's
  // recomputed once every regular-season week is submitted again.
  await clearFinalConferenceStandings(userId);
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
  await unsubmitWeekForGame(userId, gameId);
}

export async function clearPrediction(
  userId: number,
  gameId: number,
): Promise<void> {
  await sql`DELETE FROM predictions WHERE user_id = ${userId} AND game_id = ${gameId}`;
  await unsubmitWeekForGame(userId, gameId);
}

export async function isWeekSubmitted(
  userId: number,
  week: number,
  season = SEASON,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM week_submissions WHERE user_id = ${userId} AND season = ${season} AND week = ${week}
  `;
  return rows.length > 0;
}

export async function submitWeek(
  userId: number,
  week: number,
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO week_submissions (user_id, season, week)
    VALUES (${userId}, ${season}, ${week})
    ON CONFLICT (user_id, season, week) DO UPDATE SET submitted_at = now()
  `;
}

/** Weeks this user has submitted -- only these count toward Computer Rankings. */
export async function getSubmittedWeeks(
  userId: number,
  season = SEASON,
): Promise<number[]> {
  const rows = await sql<{ week: number }[]>`
    SELECT week FROM week_submissions WHERE user_id = ${userId} AND season = ${season}
  `;
  return rows.map((r) => r.week);
}

/**
 * The final, tiebreaker-resolved conference standings order (see
 * lib/conferenceTiebreakers.ts), only populated once that's been computed
 * for this user/season. Missing conferences mean "not finalized yet."
 *
 * Keyed by conference name for every conference except the Sun Belt (the
 * one FBS conference still split into East/West divisions), which is keyed
 * as `"Sun Belt (East)"` / `"Sun Belt (West)"` instead -- see
 * conferenceDivisionKey.
 */
export async function getFinalConferenceStandings(
  userId: number,
  season = SEASON,
): Promise<Map<string, number[]>> {
  const rows = await sql<{ conference: string; division: string; team_ids: number[] }[]>`
    SELECT conference, division, team_ids FROM conference_final_standings
    WHERE user_id = ${userId} AND season = ${season}
  `;
  return new Map(
    rows.map((r) => [conferenceDivisionKey(r.conference, r.division), r.team_ids]),
  );
}

export async function storeFinalConferenceStandings(
  userId: number,
  conference: string,
  teamIds: number[],
  division = "ALL",
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO conference_final_standings (season, user_id, conference, division, team_ids)
    VALUES (${season}, ${userId}, ${conference}, ${division}, ${teamIds})
    ON CONFLICT (season, user_id, conference, division) DO UPDATE SET
      team_ids = EXCLUDED.team_ids,
      computed_at = now()
  `;
}

/**
 * Wipes this user's finalized conference standings -- called whenever a
 * prediction edit un-submits a regular-season week, since the tiebreaker
 * order was computed from a now-stale set of results. It'll be recomputed
 * once every regular-season week is submitted again.
 */
export async function clearFinalConferenceStandings(
  userId: number,
  season = SEASON,
): Promise<void> {
  await sql`
    DELETE FROM conference_final_standings WHERE user_id = ${userId} AND season = ${season}
  `;
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
  // The field determines seeding, which every bracket pick depends on --
  // picking a new field invalidates any picks made against the old one.
  await sql`DELETE FROM bracket_field WHERE season = ${season} AND user_id = ${userId}`;
  await sql`DELETE FROM bracket_picks WHERE season = ${season} AND user_id = ${userId}`;
}

export async function getBracketPicks(
  userId: number,
  season = SEASON,
): Promise<Partial<Record<import("./bracket").BracketSlot, number>>> {
  const rows = await sql<{ slot: string; team_id: number }[]>`
    SELECT slot, team_id FROM bracket_picks WHERE season = ${season} AND user_id = ${userId}
  `;
  const result: Partial<Record<import("./bracket").BracketSlot, number>> = {};
  for (const row of rows) {
    result[row.slot as import("./bracket").BracketSlot] = row.team_id;
  }
  return result;
}

/**
 * Saves picks for every slot in one round in a single transaction, and
 * deletes any stored picks for slots downstream of them (later rounds that
 * depended on what's being changed) so a stale, now-impossible matchup
 * can't linger.
 */
export async function saveBracketRoundPicks(
  userId: number,
  picks: { slot: import("./bracket").BracketSlot; teamId: number }[],
  season = SEASON,
): Promise<void> {
  const { DOWNSTREAM_SLOTS } = await import("./bracket");
  await sql.begin(async (tx) => {
    for (const { slot, teamId } of picks) {
      await tx`
        INSERT INTO bracket_picks (season, user_id, slot, team_id, updated_at)
        VALUES (${season}, ${userId}, ${slot}, ${teamId}, now())
        ON CONFLICT (season, user_id, slot) DO UPDATE SET team_id = EXCLUDED.team_id, updated_at = now()
      `;
      const downstream = DOWNSTREAM_SLOTS[slot];
      if (downstream.length > 0) {
        await tx`
          DELETE FROM bracket_picks
          WHERE season = ${season} AND user_id = ${userId} AND slot = ANY(${downstream})
        `;
      }
    }
  });
}

type LeaderboardQueryRow = {
  user_id: number;
  name: string | null;
  email: string;
  total_picks: string; // bigint from Postgres COUNT(*)
  correct_picks: string;
  avg_margin_diff: string | null;
};

/**
 * One row per user who has predicted at least one game with a real result
 * in -- signed in via Google (the only auth path) is implied by having a
 * users row at all, so this naturally only surfaces people who've actually
 * filled out predictions. Margin diff is |predicted margin - actual margin|
 * (both computed team1-relative, so the sign is self-consistent regardless
 * of which team was picked), averaged over CORRECT picks only.
 */
export async function getLeaderboard(
  season = SEASON,
): Promise<LeaderboardRow[]> {
  const rows = await sql<LeaderboardQueryRow[]>`
    WITH scored AS (
      SELECT
        p.user_id,
        (p.predicted_score_team1 > p.predicted_score_team2)
          = (g.actual_score_team1 > g.actual_score_team2) AS is_correct,
        ABS(
          (p.predicted_score_team1 - p.predicted_score_team2)
          - (g.actual_score_team1 - g.actual_score_team2)
        ) AS margin_diff
      FROM predictions p
      JOIN games g ON g.id = p.game_id
      WHERE g.season = ${season}
        AND g.actual_score_team1 IS NOT NULL
        AND g.actual_score_team2 IS NOT NULL
    )
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      COUNT(*) AS total_picks,
      COUNT(*) FILTER (WHERE s.is_correct) AS correct_picks,
      AVG(s.margin_diff) FILTER (WHERE s.is_correct) AS avg_margin_diff
    FROM scored s
    JOIN users u ON u.id = s.user_id
    GROUP BY u.id, u.name, u.email
  `;

  return rows.map((row) => {
    const totalPicks = Number(row.total_picks);
    const correctPicks = Number(row.correct_picks);
    return {
      userId: row.user_id,
      displayName: formatDisplayName(row.name, row.email),
      totalPicks,
      correctPicks,
      correctPct: totalPicks > 0 ? correctPicks / totalPicks : 0,
      avgMarginDiff:
        row.avg_margin_diff !== null ? Number(row.avg_margin_diff) : null,
    };
  });
}

// ---------------------------------------------------------------------
// Postseason bonus: real-world ground truth (admin-entered) + each user's
// picks needed to score against it. See lib/postseasonBonus.ts.
// ---------------------------------------------------------------------

export async function getRealConferenceResults(
  season = SEASON,
): Promise<import("./postseasonBonus").RealConferenceResult[]> {
  const rows = await sql<
    { conference: string; champion_team_id: number; runner_up_team_id: number }[]
  >`SELECT conference, champion_team_id, runner_up_team_id FROM real_conference_results WHERE season = ${season}`;
  return rows.map((r) => ({
    conference: r.conference,
    championTeamId: r.champion_team_id,
    runnerUpTeamId: r.runner_up_team_id,
  }));
}

export async function setRealConferenceResult(
  conference: string,
  championTeamId: number,
  runnerUpTeamId: number,
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO real_conference_results (season, conference, champion_team_id, runner_up_team_id, updated_at)
    VALUES (${season}, ${conference}, ${championTeamId}, ${runnerUpTeamId}, now())
    ON CONFLICT (season, conference) DO UPDATE SET
      champion_team_id = EXCLUDED.champion_team_id,
      runner_up_team_id = EXCLUDED.runner_up_team_id,
      updated_at = now()
  `;
}

export async function getRealPlayoffRounds(
  season = SEASON,
): Promise<Partial<Record<import("./postseasonBonus").PlayoffRound, number[]>>> {
  const rows = await sql<{ round: string; team_ids: number[] }[]>`
    SELECT round, team_ids FROM real_playoff_rounds WHERE season = ${season}
  `;
  const result: Partial<Record<import("./postseasonBonus").PlayoffRound, number[]>> = {};
  for (const row of rows) {
    result[row.round as import("./postseasonBonus").PlayoffRound] = row.team_ids;
  }
  return result;
}

export async function setRealPlayoffRound(
  round: import("./postseasonBonus").PlayoffRound,
  teamIds: number[],
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO real_playoff_rounds (season, round, team_ids, updated_at)
    VALUES (${season}, ${round}, ${teamIds}, now())
    ON CONFLICT (season, round) DO UPDATE SET team_ids = EXCLUDED.team_ids, updated_at = now()
  `;
}

export async function getRealNationalChampion(
  season = SEASON,
): Promise<number | null> {
  const rows = await sql<{ team_id: number }[]>`
    SELECT team_id FROM real_national_champion WHERE season = ${season}
  `;
  return rows[0]?.team_id ?? null;
}

export async function setRealNationalChampion(
  teamId: number,
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO real_national_champion (season, team_id, updated_at)
    VALUES (${season}, ${teamId}, now())
    ON CONFLICT (season) DO UPDATE SET team_id = EXCLUDED.team_id, updated_at = now()
  `;
}

export type UserConferencePicksRow = {
  userId: number;
  displayName: string;
  picks: import("./postseasonBonus").UserConferencePick[];
};

/** Every signed-in user's own Week 16 picks (their derived matchup + predicted winner), grouped by user. */
export async function getAllConferenceTitlePicks(
  season = SEASON,
): Promise<UserConferencePicksRow[]> {
  const rows = await sql<
    {
      user_id: number;
      name: string | null;
      email: string;
      conference: string;
      team1_id: number;
      team2_id: number;
      predicted_score_team1: number | null;
      predicted_score_team2: number | null;
    }[]
  >`
    SELECT u.id AS user_id, u.name, u.email, g.conference, g.team1_id, g.team2_id,
           p.predicted_score_team1, p.predicted_score_team2
    FROM games g
    JOIN users u ON u.id = g.user_id
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = g.user_id
    WHERE g.season = ${season} AND g.week = 16 AND g.user_id IS NOT NULL AND g.conference IS NOT NULL
  `;

  const byUser = new Map<number, UserConferencePicksRow>();
  for (const row of rows) {
    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = {
        userId: row.user_id,
        displayName: formatDisplayName(row.name, row.email),
        picks: [],
      };
      byUser.set(row.user_id, entry);
    }
    entry.picks.push({
      conference: row.conference,
      team1Id: row.team1_id,
      team2Id: row.team2_id,
      predictedScoreTeam1: row.predicted_score_team1,
      predictedScoreTeam2: row.predicted_score_team2,
    });
  }
  return Array.from(byUser.values());
}

export type UserBracketPickRow = {
  userId: number;
  displayName: string;
  teamIds: number[];
  championPickTeamId: number | null;
};

/** Every signed-in user's confirmed 12-team field + champion pick (skips anyone who hasn't confirmed a field). */
export async function getAllBracketPicks(
  season = SEASON,
): Promise<UserBracketPickRow[]> {
  const rows = await sql<
    {
      user_id: number;
      name: string | null;
      email: string;
      team_ids: number[];
      champion_pick_team_id: number | null;
    }[]
  >`
    SELECT u.id AS user_id, u.name, u.email, b.team_ids, p.team_id AS champion_pick_team_id
    FROM bracket_field b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN bracket_picks p
      ON p.season = b.season AND p.user_id = b.user_id AND p.slot = 'championship'
    WHERE b.season = ${season}
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: formatDisplayName(row.name, row.email),
    teamIds: row.team_ids,
    championPickTeamId: row.champion_pick_team_id,
  }));
}
