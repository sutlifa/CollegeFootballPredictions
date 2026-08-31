import { randomBytes } from "node:crypto";
import { conferenceDivisionKey } from "./conferences";
import { sql } from "./db";
import { REGULAR_SEASON_WEEKS } from "./format";
import { formatDisplayName, type LeaderboardRow } from "./leaderboard";
import {
  isMarginBucketId,
  MARGIN_BUCKETS,
  representativeScores,
  type MarginBucketId,
} from "./margin";
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
  kickoff_tbd: boolean;
  status: GameStatus;
  winner_team_id: number | null;
  margin_bucket: number | null;
  actual_score_team1: number | null;
  actual_score_team2: number | null;
};

function mapGame(row: GameRow): Game {
  // Turn the stored pick (winner + margin bucket) into the score pair the
  // rest of the app reasons about. Only the difference matters -- see the
  // note on Game.predictedScoreTeam1 in lib/types.ts.
  let predictedScoreTeam1: number | null = null;
  let predictedScoreTeam2: number | null = null;
  if (row.winner_team_id !== null && row.margin_bucket !== null && isMarginBucketId(row.margin_bucket)) {
    const { winner, loser } = representativeScores(row.margin_bucket);
    const team1Won = row.winner_team_id === row.team1_id;
    predictedScoreTeam1 = team1Won ? winner : loser;
    predictedScoreTeam2 = team1Won ? loser : winner;
  }

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
    kickoffTbd: row.kickoff_tbd ?? false,
    status: row.status,
    predictedWinnerTeamId: row.winner_team_id,
    predictedMarginBucket: row.margin_bucket,
    predictedScoreTeam1,
    predictedScoreTeam2,
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
    SELECT g.*, p.winner_team_id, p.margin_bucket
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
    SELECT g.*, p.winner_team_id, p.margin_bucket
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND g.week = ${week}
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
    ORDER BY g.id
  `;
  return rows.map(mapGame);
}

/**
 * A team's whole season -- every week it appears in, week 0 through the
 * conference championship, with this user's pick attached.
 *
 * The user_id filter matches getGamesForWeek: regular-season games are
 * shared (user_id NULL), while week 16 is DERIVED per user from their own
 * standings, so one person's title game is not another's.
 */
/**
 * Whether this user's conference championship matchups have been derived
 * yet. Cheap existence check, so a page that merely needs week 16 to be
 * PRESENT doesn't have to pay for re-deriving it.
 */
/**
 * Whether this user has finished the regular season -- every week from 0
 * through Army-Navy submitted. Conference championship matchups are only
 * real once this is true; before it, they are derived from a part-finished
 * season and say more about which weeks happen to be filled in than about
 * who is actually going to the title game.
 */
export async function isRegularSeasonComplete(userId: number): Promise<boolean> {
  const submitted = new Set(await getSubmittedWeeks(userId));
  return REGULAR_SEASON_WEEKS.every((w) => submitted.has(w));
}

/** Which regular-season weeks are still outstanding, in order. */
export async function missingRegularSeasonWeeks(
  userId: number,
): Promise<number[]> {
  const submitted = new Set(await getSubmittedWeeks(userId));
  return REGULAR_SEASON_WEEKS.filter((w) => !submitted.has(w));
}

/**
 * Drop this user's week-16 rows that nobody has picked.
 *
 * Deliberately spares any game carrying a prediction. Users can reach week
 * 16 with the regular season not quite finished -- one has every week but
 * Army-Navy and a full, picked championship slate behind it -- and deleting
 * that would destroy real work and take their bracket with it. An unpicked
 * row is just a matchup we should not have generated yet.
 */
export async function deleteUnpickedWeek16Games(
  userId: number,
  season = SEASON,
): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    DELETE FROM games g
    WHERE g.season = ${season} AND g.week = 16 AND g.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM predictions p WHERE p.game_id = g.id
      )
    RETURNING g.id
  `;
  return rows.length;
}

export async function hasWeek16Games(
  userId: number,
  season = SEASON,
): Promise<boolean> {
  const [row] = await sql<{ any_game: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM games
      WHERE season = ${season} AND week = 16 AND user_id = ${userId}
    ) AS any_game
  `;
  return row?.any_game ?? false;
}

export async function getGamesForTeam(
  teamId: number,
  userId: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT g.*, p.winner_team_id, p.margin_bucket
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season}
      AND (g.team1_id = ${teamId} OR g.team2_id = ${teamId})
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
    ORDER BY g.week, g.id
  `;
  return rows.map(mapGame);
}

/**
 * Lock time for every week at once, keyed by week. The team page shows a
 * whole season on one screen and needs the lock state of all seventeen
 * weeks; asking getWeekLocksAt seventeen times would be seventeen
 * round-trips for one page.
 *
 * Same rule as getWeekLocksAt: prefer the earliest CONFIRMED kickoff, and
 * only fall back to a TBD placeholder when nothing in the week is timed
 * yet, so a placeholder can't drag a week's lock to the start of the day.
 */
export async function getAllWeekLocks(
  season = SEASON,
): Promise<Map<number, { locksAt: Date; locked: boolean }>> {
  const rows = await sql<
    { week: number; confirmed: Date | null; any_kickoff: Date | null }[]
  >`
    SELECT
      week,
      MIN(kickoff_at) FILTER (WHERE NOT kickoff_tbd) AS confirmed,
      MIN(kickoff_at) AS any_kickoff
    FROM games
    WHERE season = ${season} AND kickoff_at IS NOT NULL
      AND user_id IS NULL -- shared schedule only; see getWeekLocksAt
    GROUP BY week
  `;
  // Whether a week is locked is resolved HERE rather than by the caller.
  // Reading the clock during a component's render is impure -- React's lint
  // rules reject it -- and the page has no business doing time maths anyway.
  const now = Date.now();
  const locks = new Map<number, { locksAt: Date; locked: boolean }>();
  for (const row of rows) {
    const at = row.confirmed ?? row.any_kickoff;
    if (!at) continue;
    const locksAt = new Date(at);
    locks.set(row.week, { locksAt, locked: locksAt.getTime() <= now });
  }
  return locks;
}

export async function getGamesForWeeks(
  weeks: number[],
  userId: number,
  season = SEASON,
): Promise<Game[]> {
  const rows = await sql<GameRow[]>`
    SELECT g.*, p.winner_team_id, p.margin_bucket
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND g.week = ANY(${weeks})
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
    ORDER BY g.week, g.id
  `;
  return rows.map(mapGame);
}

async function unsubmitWeekForGame(userId: number, gameId: number): Promise<void> {
  const [game] = await sql<{ week: number }[]>`SELECT week FROM games WHERE id = ${gameId}`;

  // If this game's week was already submitted, editing its prediction
  // un-submits that week -- Computer Rankings must not silently pick up a
  // changed score until the user explicitly re-submits.
  await sql`
    DELETE FROM week_submissions
    WHERE user_id = ${userId}
      AND (season, week) IN (SELECT season, week FROM games WHERE id = ${gameId})
  `;

  // Any finalized conference tiebreaker order was computed from a set of
  // REGULAR-SEASON results -- only wipe it when one of those actually
  // changed, not when a Week 16 (conference championship) game is edited.
  // Week 16 is downstream of the standings, not an input to them, so
  // editing it must never clear the very order that derived it -- doing
  // so was letting Week 16 quietly fall back to the live/naive ordering
  // (which ignores head-to-head) the moment a user saved a prediction on
  // one of its own games.
  if (game && game.week !== 16) {
    await clearFinalConferenceStandings(userId);
  }
}

/**
 * When a week's picks freeze: the kickoff of the FIRST game that week --
 * usually a Wednesday or Thursday night game. Same idea as a fantasy
 * lineup locking when the week starts; once any game is underway you
 * can't still be editing that week's picks.
 *
 * Null when nothing in the week has a kickoff time yet. That's the case
 * for Week 16, whose per-user conference championship rows are derived
 * rather than pulled from the schedule -- those games instead lock
 * individually once a real result lands (see GamePicker's `isFinal`).
 */
export async function getWeekLocksAt(
  week: number,
  season = SEASON,
): Promise<Date | null> {
  // Prefer the earliest CONFIRMED kickoff. A game CFBD hasn't timed yet
  // carries a midnight-Eastern placeholder, which would otherwise drag the
  // lock to the very start of the day and freeze the week hours before
  // anything actually kicks off. Only if nothing in the week has a real
  // time yet does the placeholder stand in -- and once CFBD publishes the
  // real times the daily sync replaces it, moving the lock later.
  const [row] = await sql<{ confirmed: Date | null; any_kickoff: Date | null }[]>`
    SELECT
      MIN(kickoff_at) FILTER (WHERE NOT kickoff_tbd) AS confirmed,
      MIN(kickoff_at) AS any_kickoff
    FROM games
    WHERE season = ${season} AND week = ${week} AND kickoff_at IS NOT NULL
      -- Shared schedule only. Week 16 games are DERIVED per user, so
      -- including them would let one person's board decide when the week
      -- locks for everybody -- and a locked week rejects saves and clears
      -- alike, which reads as a button that silently does nothing.
      AND user_id IS NULL
  `;
  const locksAt = row?.confirmed ?? row?.any_kickoff ?? null;
  return locksAt ? new Date(locksAt) : null;
}

export async function isWeekLocked(
  week: number,
  season = SEASON,
): Promise<boolean> {
  const locksAt = await getWeekLocksAt(week, season);
  return locksAt !== null && locksAt.getTime() <= Date.now();
}

/** Throws if this game's week has already kicked off. */
async function assertWeekOpen(gameId: number): Promise<void> {
  const [row] = await sql<{ week: number; season: number }[]>`
    SELECT week, season FROM games WHERE id = ${gameId}
  `;
  if (!row) throw new Error("Unknown game");
  if (await isWeekLocked(row.week, row.season)) {
    throw new Error(
      "This week is locked -- its first game has already kicked off, so picks can no longer be changed.",
    );
  }
}

export async function savePrediction(
  userId: number,
  gameId: number,
  winnerTeamId: number,
  marginBucket: MarginBucketId,
): Promise<void> {
  // Enforced on the server, not just by disabling the buttons -- otherwise
  // a stale page or a hand-rolled form post could still write after lock.
  await assertWeekOpen(gameId);

  // The winner has to be one of the two teams actually in this game --
  // guards against a tampered form post writing a nonsense pick.
  const [game] = await sql<{ team1_id: number; team2_id: number }[]>`
    SELECT team1_id, team2_id FROM games WHERE id = ${gameId}
  `;
  if (!game) throw new Error("Unknown game");
  if (winnerTeamId !== game.team1_id && winnerTeamId !== game.team2_id) {
    throw new Error("Winner must be one of the two teams in this game");
  }

  await sql`
    INSERT INTO predictions (user_id, game_id, winner_team_id, margin_bucket)
    VALUES (${userId}, ${gameId}, ${winnerTeamId}, ${marginBucket})
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      winner_team_id = EXCLUDED.winner_team_id,
      margin_bucket = EXCLUDED.margin_bucket,
      updated_at = now()
  `;
  await unsubmitWeekForGame(userId, gameId);
}

export async function clearPrediction(
  userId: number,
  gameId: number,
): Promise<void> {
  await assertWeekOpen(gameId);
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

/**
 * Submits a week automatically once every game in it has a pick, and
 * withdraws the submission if it no longer does.
 *
 * There's no reason to make people press a button that can only ever be
 * pressed when the week is already complete -- and because editing a pick
 * clears the submission first, a change to an otherwise-finished week
 * would silently drop it out of the rankings until they noticed. Calling
 * this after every save/clear keeps "complete" and "submitted" the same
 * thing.
 */
export async function syncWeekSubmission(
  userId: number,
  week: number,
  season = SEASON,
): Promise<boolean> {
  const [row] = await sql<{ total: number; picked: number }[]>`
    SELECT
      COUNT(g.id)::int AS total,
      COUNT(p.id)::int AS picked
    FROM games g
    LEFT JOIN predictions p ON p.game_id = g.id AND p.user_id = ${userId}
    WHERE g.season = ${season} AND g.week = ${week}
      AND (g.user_id = ${userId} OR (g.user_id IS NULL AND g.week <> 16))
  `;
  const complete = !!row && row.total > 0 && row.picked === row.total;
  if (complete) {
    await submitWeek(userId, week, season);
  } else {
    await sql`
      DELETE FROM week_submissions
      WHERE user_id = ${userId} AND season = ${season} AND week = ${week}
    `;
  }
  return complete;
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
  picks_made: string; // bigint from Postgres COUNT(*)
  games_available: string;
  conf_champ_picked: string;
  conf_champ_available: string;
  total_picks: string;
  correct_picks: string;
  correct_margins: string;
};

/**
 * One row per signed-in user -- EVERY user, not just those with results to
 * be scored on. Before the season starts nothing has a real result yet, so
 * a results-only leaderboard would simply be empty; instead each user shows
 * how much of their slate they've filled in (picks_made / games_available),
 * which is the only meaningful preseason standing.
 *
 * Conference championships (Week 16) are deliberately EXCLUDED from
 * picks_made / games_available. Those rows are derived per-user from each
 * person's own predicted standings, so counting them made the denominator
 * differ between people -- 897 for someone who'd opened Week 16, 888 for
 * someone who hadn't -- which made the Picked column look broken. They're
 * counted separately (conf_champ_*) and scored on their own terms.
 */
/**
 * The margin-bucket CASE arms, built from MARGIN_BUCKETS so SQL and
 * TypeScript cannot disagree about where 7 ends and 8 begins. Every value
 * interpolated is a number from that frozen table, checked below, so this
 * is safe to pass through sql.unsafe.
 */
function marginBucketSqlCase(marginExpr: string): string {
  const arms: string[] = [];
  for (const bucket of MARGIN_BUCKETS) {
    if (!Number.isInteger(bucket.id)) {
      throw new Error(`Non-integer margin bucket id: ${bucket.id}`);
    }
    if (bucket.max === Infinity) continue; // the open-ended top bucket is ELSE
    if (!Number.isInteger(bucket.max)) {
      throw new Error(`Non-integer margin bucket max: ${bucket.max}`);
    }
    arms.push(`WHEN ${marginExpr} <= ${bucket.max} THEN ${bucket.id}`);
  }
  const open = MARGIN_BUCKETS.find((b) => b.max === Infinity);
  if (!open) throw new Error("MARGIN_BUCKETS has no open-ended top bucket");
  arms.push(`ELSE ${open.id}`);
  return arms.join(" ");
}

// ---------------------------------------------------------------------
// Weekly pick reminders (lib/reminders.ts decides; this only fetches).
// ---------------------------------------------------------------------

export async function getReminderUsers(): Promise<
  import("./reminders").ReminderUser[]
> {
  const rows = await sql<
    {
      id: number;
      email: string;
      name: string | null;
      email_reminders: boolean;
      unsubscribe_token: string | null;
    }[]
  >`SELECT id, email, name, email_reminders, unsubscribe_token FROM users ORDER BY id`;
  return rows.map((r) => ({
    userId: r.id,
    email: r.email,
    name: r.name,
    emailReminders: r.email_reminders,
    unsubscribeToken: r.unsubscribe_token,
  }));
}

/**
 * Lock time and game count for every shared week. Week 16 is excluded: it
 * is derived per user, so there is no single slate to be reminded about.
 */
export async function getWeekStates(
  season = SEASON,
): Promise<import("./reminders").WeekState[]> {
  const rows = await sql<
    { week: number; confirmed: Date | null; any_kickoff: Date | null; n: number }[]
  >`
    SELECT week,
           MIN(kickoff_at) FILTER (WHERE NOT kickoff_tbd) AS confirmed,
           MIN(kickoff_at) AS any_kickoff,
           COUNT(*)::int AS n
    FROM games
    WHERE season = ${season} AND user_id IS NULL AND week <> 16
    GROUP BY week
  `;
  const states: import("./reminders").WeekState[] = [];
  for (const row of rows) {
    const at = row.confirmed ?? row.any_kickoff;
    if (!at) continue; // a week with no kickoff time can't be reminded about
    states.push({ week: row.week, locksAt: new Date(at), totalGames: row.n });
  }
  return states;
}

/** How many games each user has picked in one week. */
export async function getWeekProgress(
  week: number,
  season = SEASON,
): Promise<import("./reminders").UserWeekProgress[]> {
  const rows = await sql<{ user_id: number; picks_made: number }[]>`
    SELECT p.user_id, COUNT(*)::int AS picks_made
    FROM predictions p
    JOIN games g ON g.id = p.game_id
    WHERE g.season = ${season} AND g.week = ${week} AND g.user_id IS NULL
    GROUP BY p.user_id
  `;
  return rows.map((r) => ({ userId: r.user_id, week, picksMade: r.picks_made }));
}

/** The (user, week, kind) reminders already sent, as sendKey strings. */
export async function getSentReminders(
  week: number,
  season = SEASON,
): Promise<Set<string>> {
  const rows = await sql<{ user_id: number; week: number; kind: string }[]>`
    SELECT user_id, week, kind FROM email_sends
    WHERE season = ${season} AND week = ${week} AND error IS NULL
  `;
  return new Set(rows.map((r) => `${r.user_id}:${r.week}:${r.kind}`));
}

/**
 * Record an attempt. The unique index on (user_id, season, week, kind) is
 * the real guard against double-sending; ON CONFLICT DO NOTHING means a
 * concurrent or retried run loses the race harmlessly instead of erroring.
 */
export async function recordReminderSent(
  userId: number,
  week: number,
  kind: string,
  error: string | null,
  season = SEASON,
): Promise<void> {
  await sql`
    INSERT INTO email_sends (user_id, season, week, kind, error)
    VALUES (${userId}, ${season}, ${week}, ${kind}, ${error})
    ON CONFLICT (user_id, season, week, kind) DO NOTHING
  `;
}

/**
 * Give every user without one a token, so unsubscribe links can be built.
 *
 * Generated in Node rather than by the database: `gen_random_bytes` lives in
 * the pgcrypto extension, which this database does not have installed, and
 * requiring an extension for one column is a worse trade than a few extra
 * round trips for a handful of users.
 */
export async function backfillUnsubscribeTokens(): Promise<number> {
  const pending = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE unsubscribe_token IS NULL
  `;
  for (const row of pending) {
    await sql`
      UPDATE users SET unsubscribe_token = ${randomBytes(24).toString("hex")}
      WHERE id = ${row.id}
    `;
  }
  return pending.length;
}

/** Opt out. Returns false when the token matches nobody. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    UPDATE users SET email_reminders = FALSE
    WHERE unsubscribe_token = ${token}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function getLeaderboard(
  season = SEASON,
): Promise<LeaderboardRow[]> {
  const rows = await sql<LeaderboardQueryRow[]>`
    WITH shared_games AS (
      -- The regular season only, and identical for everyone.
      SELECT COUNT(*) AS n
      FROM games
      WHERE season = ${season} AND user_id IS NULL AND week <> 16
    ),
    picks AS (
      SELECT p.user_id, COUNT(*) AS picks_made
      FROM predictions p
      JOIN games g ON g.id = p.game_id
      WHERE g.season = ${season} AND g.week <> 16
      GROUP BY p.user_id
    ),
    conf_champ AS (
      SELECT
        u.id AS user_id,
        COUNT(g.id) AS conf_champ_available,
        COUNT(p.id) AS conf_champ_picked
      FROM users u
      LEFT JOIN games g
        ON g.user_id = u.id AND g.season = ${season} AND g.week = 16
      LEFT JOIN predictions p
        ON p.game_id = g.id AND p.user_id = u.id
      GROUP BY u.id
    ),
    scored AS (
      SELECT
        p.user_id,
        p.winner_team_id = CASE
          WHEN g.actual_score_team1 > g.actual_score_team2 THEN g.team1_id
          ELSE g.team2_id
        END AS winner_correct,
        -- Bucket boundaries are GENERATED from lib/margin.ts rather than
        -- written out here, so the two can never drift apart. They were
        -- transcribed by hand once and did agree, but a hand-kept copy of a
        -- constant is a bug waiting for someone to edit one side.
        p.margin_bucket = CASE
          ${sql.unsafe(marginBucketSqlCase("ABS(g.actual_score_team1 - g.actual_score_team2)"))}
        END AS margin_correct
      FROM predictions p
      JOIN games g ON g.id = p.game_id
      WHERE g.season = ${season}
        -- Regular season only. Conference championships are excluded from
        -- picks_made and games_available above, so grading them here too
        -- would report a hit rate over a bigger set of games than the one
        -- the "picked" column counts -- two numbers on one row silently
        -- describing different slates. Titles are scored separately, as
        -- their own end-of-season bonus (lib/seasonScore.ts).
        AND g.week <> 16
        AND g.actual_score_team1 IS NOT NULL
        AND g.actual_score_team2 IS NOT NULL
        AND g.actual_score_team1 <> g.actual_score_team2
    ),
    scored_agg AS (
      SELECT
        user_id,
        COUNT(*) AS total_picks,
        COUNT(*) FILTER (WHERE winner_correct) AS correct_picks,
        -- Margin accuracy is only asked about games whose winner was
        -- already right: getting the margin "right" on a game you picked
        -- the wrong way isn't worth crediting.
        COUNT(*) FILTER (WHERE winner_correct AND margin_correct) AS correct_margins
      FROM scored
      GROUP BY user_id
    )
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      COALESCE(pk.picks_made, 0) AS picks_made,
      (SELECT n FROM shared_games) AS games_available,
      COALESCE(cc.conf_champ_picked, 0) AS conf_champ_picked,
      COALESCE(cc.conf_champ_available, 0) AS conf_champ_available,
      COALESCE(sa.total_picks, 0) AS total_picks,
      COALESCE(sa.correct_picks, 0) AS correct_picks,
      COALESCE(sa.correct_margins, 0) AS correct_margins
    FROM users u
    LEFT JOIN picks pk ON pk.user_id = u.id
    LEFT JOIN conf_champ cc ON cc.user_id = u.id
    LEFT JOIN scored_agg sa ON sa.user_id = u.id
  `;

  return rows.map((row) => {
    const totalPicks = Number(row.total_picks);
    const correctPicks = Number(row.correct_picks);
    const correctMargins = Number(row.correct_margins);
    const picksMade = Number(row.picks_made);
    const gamesAvailable = Number(row.games_available);
    const confChampPicked = Number(row.conf_champ_picked);
    const confChampAvailable = Number(row.conf_champ_available);
    return {
      userId: row.user_id,
      displayName: formatDisplayName(row.name, row.email),
      picksMade,
      gamesAvailable,
      pickedPct: gamesAvailable > 0 ? picksMade / gamesAvailable : 0,
      confChampPicked,
      confChampAvailable,
      totalPicks,
      correctPicks,
      correctPct: totalPicks > 0 ? correctPicks / totalPicks : 0,
      correctMargins,
      marginPct: correctPicks > 0 ? correctMargins / correctPicks : 0,
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
      winner_team_id: number | null;
    }[]
  >`
    SELECT u.id AS user_id, u.name, u.email, g.conference, g.team1_id, g.team2_id,
           p.winner_team_id
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
      predictedWinnerTeamId: row.winner_team_id,
    });
  }
  return Array.from(byUser.values());
}

export type UserBracketPickRow = {
  userId: number;
  displayName: string;
  teamIds: number[];
  /**
   * Whoever they had winning the four quarterfinals -- i.e. the four teams
   * they have playing in the semifinals. Shorter than 4 if they haven't
   * filled the bracket that far in yet.
   */
  finalFourTeamIds: number[];
  championPickTeamId: number | null;
};

/** Every signed-in user's confirmed 12-team field, Final Four and champion pick (skips anyone who hasn't confirmed a field). */
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
      final_four_team_ids: number[] | null;
    }[]
  >`
    SELECT u.id AS user_id, u.name, u.email, b.team_ids,
           champ.team_id AS champion_pick_team_id,
           (
             SELECT ARRAY_AGG(f.team_id ORDER BY f.slot)
             FROM bracket_picks f
             WHERE f.season = b.season AND f.user_id = b.user_id
               AND f.slot IN ('qf_1', 'qf_2', 'qf_3', 'qf_4')
           ) AS final_four_team_ids
    FROM bracket_field b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN bracket_picks champ
      ON champ.season = b.season AND champ.user_id = b.user_id AND champ.slot = 'championship'
    WHERE b.season = ${season}
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: formatDisplayName(row.name, row.email),
    teamIds: row.team_ids,
    finalFourTeamIds: row.final_four_team_ids ?? [],
    championPickTeamId: row.champion_pick_team_id,
  }));
}
