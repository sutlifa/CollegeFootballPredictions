import { deriveWeek16Matchups, diffWeek16Matchups } from "./deriveWeek16";
import { REGULAR_SEASON_WEEKS } from "./format";
import {
  deleteStaleWeek16Game,
  deleteUnpickedWeek16Games,
  getAllTeams,
  getFinalConferenceStandings,
  getGamesForWeeks,
  isRegularSeasonComplete,
  upsertWeek16Game,
} from "./queries";

/**
 * Called whenever a user visits the Week 16 page. Recomputes that user's
 * conference championship pairings from their own weeks 1-15 predictions
 * and writes any changes to the database. Each user gets their own Week 16
 * rows (games.user_id), since two users' predictions can produce different
 * conference champions. If a conference's top two teams changed since the
 * last visit, the stale matchup row is replaced (its old prediction doesn't
 * carry over -- it belonged to different teams).
 */
export async function syncWeek16Games(
  userId: number,
): Promise<{ changedConferences: string[] }> {
  // Nothing to derive until the regular season is actually finished.
  //
  // This used to run against whatever had been picked so far, which meant a
  // user one week into the season was handed nine conference championship
  // games built from a nearly empty table -- pickable, and showing up on
  // team pages, where a stray title-game pick put a team at 1-0 having
  // played nobody. A matchup derived from a part-finished season describes
  // which weeks happen to be filled in, not who is going to the title game.
  //
  // Rows already carrying a pick are left alone. Someone can be a single
  // week short -- one user has everything except Army-Navy and a complete,
  // picked championship slate behind it -- and dropping that would destroy
  // real work and their bracket with it. Only unpicked rows, which should
  // never have been generated, are cleared away.
  if (!(await isRegularSeasonComplete(userId))) {
    const removed = await deleteUnpickedWeek16Games(userId);
    // Removing a matchup is a change too: a bracket built on a championship
    // that no longer exists is stale.
    return { changedConferences: removed > 0 ? ["*"] : [] };
  }

  const teams = await getAllTeams();
  const gamesWeeks1to15 = await getGamesForWeeks(REGULAR_SEASON_WEEKS, userId);
  const existingWeek16 = await getGamesForWeeks([16], userId);
  const finalStandings = await getFinalConferenceStandings(userId);

  const derived = deriveWeek16Matchups(teams, gamesWeeks1to15, finalStandings);
  const { toUpsert } = diffWeek16Matchups(derived, existingWeek16);

  for (const matchup of toUpsert) {
    await deleteStaleWeek16Game(
      userId,
      matchup.conference,
      matchup.team1Id,
      matchup.team2Id,
    );
    await upsertWeek16Game(
      userId,
      matchup.conference,
      matchup.team1Id,
      matchup.team2Id,
    );
  }

  // Which conferences got a different matchup than they had. The caller
  // needs this to decide whether a confirmed playoff field is still valid.
  return { changedConferences: toUpsert.map((m) => m.conference) };
}
