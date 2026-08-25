import { deriveWeek16Matchups, diffWeek16Matchups } from "./deriveWeek16";
import {
  deleteStaleWeek16Game,
  getAllTeams,
  getGamesForWeeks,
  upsertWeek16Game,
} from "./queries";

/**
 * Called whenever the Week 16 page is visited. Recomputes each conference's
 * championship pairing from weeks 1-15 predictions and writes any changes to
 * the database. If a conference's top two teams changed since the last
 * visit, the stale matchup row is replaced (its old prediction doesn't carry
 * over -- it belonged to different teams).
 */
export async function syncWeek16Games(): Promise<void> {
  const teams = await getAllTeams();
  const gamesWeeks1to15 = await getGamesForWeeks([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const existingWeek16 = await getGamesForWeeks([16]);

  const derived = deriveWeek16Matchups(teams, gamesWeeks1to15);
  const { toUpsert } = diffWeek16Matchups(derived, existingWeek16);

  for (const matchup of toUpsert) {
    await deleteStaleWeek16Game(
      matchup.conference,
      matchup.team1Id,
      matchup.team2Id,
    );
    await upsertWeek16Game(
      matchup.conference,
      matchup.team1Id,
      matchup.team2Id,
    );
  }
}
