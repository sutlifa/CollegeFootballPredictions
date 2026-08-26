import { deriveWeek16Matchups, diffWeek16Matchups } from "./deriveWeek16";
import { REGULAR_SEASON_WEEKS } from "./format";
import {
  deleteStaleWeek16Game,
  getAllTeams,
  getFinalConferenceStandings,
  getGamesForWeeks,
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
export async function syncWeek16Games(userId: number): Promise<void> {
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
}
