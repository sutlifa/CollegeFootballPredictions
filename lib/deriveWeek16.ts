import {
  CHAMPIONSHIP_CONFERENCES,
  conferenceDivisionKey,
  SUN_BELT_DIVISIONS,
} from "./conferences";
import {
  resolveConferenceStandingsWithTiebreakers,
  resolveSunBeltDivisionStandings,
} from "./tiebreakerRules";
import type { Game, Team } from "./types";

export type Week16Matchup = {
  conference: string;
  team1Id: number;
  team2Id: number;
};

/**
 * Week 16 (conference championships) is never pulled from CFBD in advance --
 * it's derived from each conference's top two teams (or, for the Sun Belt,
 * its East and West division champions -- see below), using weeks 1-15
 * predictions only.
 *
 * A conference's real tiebreaker procedure (head-to-head sweep, then
 * common-opponents win percentage, then further conference-specific steps --
 * see lib/tiebreakerRules.ts) is only STORED once and locked in once the
 * full regular season is in (see lib/conferenceTiebreakers.ts), rather than
 * being re-derived every visit -- that's what makes it a stable, final
 * answer instead of something that could keep shifting under a submitted
 * Week 16 pick. `finalStandings` carries that stored order for conferences
 * where it's ready (keyed by conferenceDivisionKey). For any conference not
 * yet in there (season still in progress, or a regular-season prediction
 * was edited since), this still runs the SAME real tiebreaker procedure
 * live, as a mid-season preview -- there's no reason the preview should
 * fall back to a cruder ordering that ignores head-to-head just because
 * it isn't locked in yet.
 */
export function deriveWeek16Matchups(
  teams: Team[],
  gamesWeeks1to15: Game[],
  finalStandings?: Map<string, number[]>,
): Week16Matchup[] {
  const matchups: Week16Matchup[] = [];
  for (const conference of CHAMPIONSHIP_CONFERENCES) {
    if (conference === "Sun Belt") {
      const matchup = deriveSunBeltMatchup(teams, gamesWeeks1to15, finalStandings);
      if (matchup) matchups.push(matchup);
      continue;
    }

    const finalOrder = finalStandings?.get(conferenceDivisionKey(conference, "ALL"));
    if (finalOrder) {
      if (finalOrder.length < 2) continue;
      matchups.push({
        conference,
        team1Id: finalOrder[0],
        team2Id: finalOrder[1],
      });
      continue;
    }

    const standings = resolveConferenceStandingsWithTiebreakers(
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
 * The Sun Belt is the one championship conference still split into East and
 * West divisions -- its title game is division champ vs. division champ,
 * not the conference's top two teams overall.
 */
function deriveSunBeltMatchup(
  teams: Team[],
  gamesWeeks1to15: Game[],
  finalStandings?: Map<string, number[]>,
): Week16Matchup | null {
  const divisionChampion = (division: "East" | "West"): number | null => {
    const finalOrder = finalStandings?.get(
      conferenceDivisionKey("Sun Belt", division),
    );
    if (finalOrder) return finalOrder[0] ?? null;

    const standings = resolveSunBeltDivisionStandings(teams, gamesWeeks1to15, division);
    return standings[0]?.teamId ?? null;
  };

  const divisions = Object.keys(SUN_BELT_DIVISIONS) as ("East" | "West")[];
  const [eastChampion, westChampion] = divisions.map(divisionChampion);
  if (eastChampion == null || westChampion == null) return null;
  return { conference: "Sun Belt", team1Id: eastChampion, team2Id: westChampion };
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
