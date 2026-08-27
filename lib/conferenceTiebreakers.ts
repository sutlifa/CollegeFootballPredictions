import { CHAMPIONSHIP_CONFERENCES, SUN_BELT_DIVISIONS } from "./conferences";
import { REGULAR_SEASON_WEEKS } from "./format";
import {
  getAllTeams,
  getGamesForWeeks,
  getSubmittedWeeks,
  storeFinalConferenceStandings,
} from "./queries";
import {
  resolveConferenceStandingsWithTiebreakers,
  resolveSunBeltDivisionStandings,
} from "./tiebreakerRules";

export * from "./tiebreakerRules";

/**
 * Called right after a week submission -- if this user has now submitted
 * every regular-season week (0 through the Army-Navy week), compute and
 * store the final, tiebreaker-resolved standings order for every
 * championship conference (the Sun Belt gets two rows, one per division).
 * A no-op otherwise (still mid-season).
 */
export async function finalizeConferenceStandingsIfReady(
  userId: number,
): Promise<void> {
  const submitted = new Set(await getSubmittedWeeks(userId));
  const complete = REGULAR_SEASON_WEEKS.every((w) => submitted.has(w));
  if (!complete) return;

  const teams = await getAllTeams();
  const games = await getGamesForWeeks(REGULAR_SEASON_WEEKS, userId);

  for (const conference of CHAMPIONSHIP_CONFERENCES) {
    if (conference === "Sun Belt") {
      for (const division of Object.keys(SUN_BELT_DIVISIONS) as ("East" | "West")[]) {
        const standings = resolveSunBeltDivisionStandings(teams, games, division);
        await storeFinalConferenceStandings(
          userId,
          conference,
          standings.map((row) => row.teamId),
          division,
        );
      }
      continue;
    }
    const standings = resolveConferenceStandingsWithTiebreakers(teams, games, conference);
    await storeFinalConferenceStandings(userId, conference, standings.map((row) => row.teamId));
  }
}
