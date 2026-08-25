import { CHAMPIONSHIP_CONFERENCES } from "./conferences";
import { computeConferenceStandings } from "./standings";
import type { Game, Team } from "./types";

export type Week16Matchup = {
  conference: string;
  team1Id: number;
  team2Id: number;
};

/**
 * Week 16 (conference championships) is never pulled from ESPN in advance --
 * it's derived from each conference's top two teams by the same tiebreak
 * chain as Standings, using weeks 1-15 predictions only. Deterministic: no
 * ties possible since team name is the final tiebreaker.
 */
export function deriveWeek16Matchups(
  teams: Team[],
  gamesWeeks1to15: Game[],
): Week16Matchup[] {
  const matchups: Week16Matchup[] = [];
  for (const conference of CHAMPIONSHIP_CONFERENCES) {
    const standings = computeConferenceStandings(
      teams,
      gamesWeeks1to15,
      conference,
    );
    if (standings.length < 2) continue;
    matchups.push({
      conference,
      team1Id: standings[0].teamId,
      team2Id: standings[1].teamId,
    });
  }
  return matchups;
}

/**
 * Compares freshly-derived matchups against the existing week-16 games for a
 * season and reports which ones need to change (new conference, or the
 * matchup no longer matches who's actually in it). The caller is responsible
 * for writing these to the database; this function is pure so the logic can
 * be unit tested without a DB.
 */
export function diffWeek16Matchups(
  derived: Week16Matchup[],
  existing: Pick<Game, "conference" | "team1Id" | "team2Id">[],
): { toUpsert: Week16Matchup[]; unchangedConferences: Set<string> } {
  const existingByConf = new Map(
    existing
      .filter((g): g is typeof g & { conference: string } => !!g.conference)
      .map((g) => [g.conference, g]),
  );

  const toUpsert: Week16Matchup[] = [];
  const unchangedConferences = new Set<string>();

  for (const matchup of derived) {
    const current = existingByConf.get(matchup.conference);
    const sameTeams =
      current &&
      current.team1Id === matchup.team1Id &&
      current.team2Id === matchup.team2Id;
    if (sameTeams) {
      unchangedConferences.add(matchup.conference);
    } else {
      toUpsert.push(matchup);
    }
  }

  return { toUpsert, unchangedConferences };
}
