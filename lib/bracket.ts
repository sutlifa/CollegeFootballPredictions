import type { Game, RankingRow } from "./types";
import { isDecided } from "./types";

/**
 * The 2026-27 CFP automatic-bid rules (per the CFP Management Committee's
 * January 2026 announcement -- a change from the 2024/25 "5 highest-ranked
 * conference champions" model):
 *
 *  - The ACC, Big 12, Big Ten, and SEC champions each get an automatic bid
 *    *regardless of their final ranking* -- 4 guaranteed bids, one per
 *    conference.
 *  - The Group of Six (American, CUSA, MAC, Mountain West, Pac 12, Sun Belt)
 *    gets exactly ONE automatic bid: the single highest-ranked team from any
 *    of those conferences, *whether or not it actually won its own
 *    conference championship*.
 *  - Notre Dame (and any other independent) has no automatic-bid path at
 *    all -- as a non-conference team it can never win a "conference
 *    championship", so it competes purely as an at-large candidate on
 *    ranking merit, same as any Power-4 team that didn't win its conference.
 *  - The remaining 7 spots are open at-large bids, filled by ranking.
 *
 * This app never auto-selects the field (that stays a manual, per-user
 * decision -- see app/bracket/actions.ts) -- it only *labels* which teams
 * currently satisfy an automatic-bid rule so the human picking the field
 * has that information in front of them.
 */
export const POWER_CONFERENCES = ["ACC", "Big 12", "Big Ten", "SEC"] as const;
export const GROUP_OF_SIX_CONFERENCES = [
  "American",
  "CUSA",
  "MAC",
  "Mountain West",
  "Pac 12",
  "Sun Belt",
] as const;

export type ConferenceChampion = {
  conference: string;
  teamId: number;
};

export type AutoBidReason = "power-champion" | "group-of-six" | null;

export type BracketCandidates = {
  /** ACC/Big 12/Big Ten/SEC champions decided so far -- each is guaranteed an automatic bid no matter how they're ranked. */
  powerChampions: ConferenceChampion[];
  /** The single highest-ranked Group of Six team (not necessarily a conference champion) -- gets the one automatic Group of Six bid. Null if no Group of Six team has a rating yet. */
  groupOfSixAutoBid: { teamId: number; team: string; conference: string } | null;
  /** Full computer rankings, annotated with why (if any) a team currently has an automatic bid. */
  rankings: (RankingRow & { autoBidReason: AutoBidReason })[];
};

/**
 * Surfaces the information a human needs to hand-pick the 12-team field --
 * it does NOT select the field itself. Bracket selection stays a manual,
 * per-user decision (see app/bracket/actions.ts); this just tells you who's
 * currently automatic-bid eligible under the real 2026-27 rules and how
 * everyone ranks.
 */
export function getBracketCandidates(
  games: Game[],
  rankings: RankingRow[],
): BracketCandidates {
  const powerChampions: ConferenceChampion[] = [];
  for (const game of games) {
    if (game.week !== 16 || !game.conference || !isDecided(game)) continue;
    if (!(POWER_CONFERENCES as readonly string[]).includes(game.conference)) {
      continue;
    }
    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    powerChampions.push({
      conference: game.conference,
      teamId: team1Won ? game.team1Id : game.team2Id,
    });
  }
  const powerChampionTeamIds = new Set(powerChampions.map((c) => c.teamId));

  // `rankings` is already sorted highest-rated first, so the first Group of
  // Six team encountered is the highest-ranked one -- champion or not.
  const highestG6 = rankings.find((r) =>
    (GROUP_OF_SIX_CONFERENCES as readonly string[]).includes(r.conference),
  );
  const groupOfSixAutoBid = highestG6
    ? { teamId: highestG6.teamId, team: highestG6.team, conference: highestG6.conference }
    : null;

  return {
    powerChampions,
    groupOfSixAutoBid,
    rankings: rankings.map((row) => {
      let autoBidReason: AutoBidReason = null;
      if (powerChampionTeamIds.has(row.teamId)) autoBidReason = "power-champion";
      else if (groupOfSixAutoBid && row.teamId === groupOfSixAutoBid.teamId) {
        autoBidReason = "group-of-six";
      }
      return { ...row, autoBidReason };
    }),
  };
}

export type BracketGame = {
  round: 1 | 2 | 3;
  higherSeed: number;
  lowerSeed: number | null; // null = higher seed has a bye
};

export type Bracket = {
  seeds: (RankingRow & { seed: number })[];
  round1: BracketGame[];
};

/**
 * Takes the user-confirmed 12 team IDs and seeds them 1-12 by Computer
 * Ranking score (highest ranked = 1 seed). Seeds 1-4 get byes -- per the
 * 2026-27 rules this is now purely by rank, not reserved for conference
 * champions (that was the 2024/25 rule). Round 1 is 5v12, 6v11, 7v10, 8v9.
 */
export function computeBracketSeeding(
  selectedTeamIds: number[],
  rankings: RankingRow[],
): Bracket {
  if (selectedTeamIds.length !== 12) {
    throw new Error(
      `Bracket field must have exactly 12 teams, got ${selectedTeamIds.length}`,
    );
  }

  const rankingByTeamId = new Map(rankings.map((r) => [r.teamId, r]));
  const selected = selectedTeamIds.map((teamId) => {
    const row = rankingByTeamId.get(teamId);
    if (!row) {
      throw new Error(`Selected team ${teamId} not found in rankings`);
    }
    return row;
  });

  const seeded = [...selected]
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, seed: i + 1 }));

  const round1: BracketGame[] = [
    { round: 1, higherSeed: 1, lowerSeed: null },
    { round: 1, higherSeed: 2, lowerSeed: null },
    { round: 1, higherSeed: 3, lowerSeed: null },
    { round: 1, higherSeed: 4, lowerSeed: null },
    { round: 1, higherSeed: 5, lowerSeed: 12 },
    { round: 1, higherSeed: 6, lowerSeed: 11 },
    { round: 1, higherSeed: 7, lowerSeed: 10 },
    { round: 1, higherSeed: 8, lowerSeed: 9 },
  ];

  return { seeds: seeded, round1 };
}
