import type { Game, RankingRow } from "./types";
import { isDecided } from "./types";

export type ConferenceChampion = {
  conference: string;
  teamId: number;
};

export type BracketCandidates = {
  /** Conference champions decided so far (winner of that conference's week-16 game). */
  champions: ConferenceChampion[];
  /** Full computer rankings, annotated with whether each team is already a champion. */
  rankings: (RankingRow & { isChampion: boolean })[];
};

/**
 * Surfaces the information a human needs to hand-pick the 12-team field --
 * it does NOT select the field itself. Bracket selection stays a manual,
 * per-user decision (see app/bracket/actions.ts); this just tells you who
 * won each conference championship and how everyone ranks.
 */
export function getBracketCandidates(
  games: Game[],
  rankings: RankingRow[],
): BracketCandidates {
  const champions: ConferenceChampion[] = [];
  for (const game of games) {
    if (game.week !== 16 || !game.conference || !isDecided(game)) continue;
    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    champions.push({
      conference: game.conference,
      teamId: team1Won ? game.team1Id : game.team2Id,
    });
  }
  const championTeamIds = new Set(champions.map((c) => c.teamId));

  return {
    champions,
    rankings: rankings.map((row) => ({
      ...row,
      isChampion: championTeamIds.has(row.teamId),
    })),
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
 * Ranking score (highest ranked = 1 seed). Seeds 1-4 get byes. Round 1 is
 * 5v12, 6v11, 7v10, 8v9 -- standard 12-team CFP reseeding.
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
