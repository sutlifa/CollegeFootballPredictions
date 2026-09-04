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

  // Every Group of Six champion, so the bid below can only go to one of
  // them. Collected in the same pass shape as the power champions.
  const groupOfSixChampionIds = new Set<number>();
  for (const game of games) {
    if (game.week !== 16 || !game.conference || !isDecided(game)) continue;
    if (!(GROUP_OF_SIX_CONFERENCES as readonly string[]).includes(game.conference)) {
      continue;
    }
    const team1Won = game.predictedScoreTeam1! > game.predictedScoreTeam2!;
    groupOfSixChampionIds.add(team1Won ? game.team1Id : game.team2Id);
  }

  // The fifth automatic bid belongs to the highest-ranked Group of Six
  // CHAMPION, not merely the highest-ranked Group of Six team. This used to
  // take whoever sat highest regardless, which handed the bid to teams that
  // had just lost their title game -- a side that did not win its own
  // conference cannot be that conference tier's representative, and the
  // real committee has never done it either. Rankings are already sorted
  // best-first, so the first match is the right one.
  const highestG6 = rankings.find(
    (r) =>
      (GROUP_OF_SIX_CONFERENCES as readonly string[]).includes(r.conference) &&
      groupOfSixChampionIds.has(r.teamId),
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

export type Seed = RankingRow & { seed: number };

/**
 * Takes the user-confirmed 12 team IDs and seeds them 1-12 by Computer
 * Ranking score (highest ranked = 1 seed). Seeds 1-4 get byes -- per the
 * 2026-27 rules this is purely by rank, not reserved for conference
 * champions (that was the 2024/25 rule).
 */
export function seedBracketField(
  selectedTeamIds: number[],
  rankings: RankingRow[],
): Seed[] {
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

  return [...selected]
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, seed: i + 1 }));
}

/**
 * The real, fixed 12-team CFP bracket tree -- confirmed against the CFP's
 * own published structure, not reseeded round to round:
 *   Round 1:        5v12, 6v11, 7v10, 8v9 (seeds 1-4 bye straight to QF)
 *   Quarterfinal:   1 vs winner(8v9), 2 vs winner(7v10),
 *                   3 vs winner(6v11), 4 vs winner(5v12)
 *   Semifinal:      winner(QF1) vs winner(QF2), winner(QF3) vs winner(QF4)
 *   Championship:   winner(SF1) vs winner(SF2)
 */
export type BracketSlot =
  | "r1_5v12"
  | "r1_6v11"
  | "r1_7v10"
  | "r1_8v9"
  | "qf_1"
  | "qf_2"
  | "qf_3"
  | "qf_4"
  | "sf_1"
  | "sf_2"
  | "championship";

export const BRACKET_ROUNDS = [
  "round1",
  "quarterfinal",
  "semifinal",
  "championship",
] as const;
export type BracketRound = (typeof BRACKET_ROUNDS)[number];

export const SLOTS_BY_ROUND: Record<BracketRound, BracketSlot[]> = {
  round1: ["r1_5v12", "r1_6v11", "r1_7v10", "r1_8v9"],
  quarterfinal: ["qf_1", "qf_2", "qf_3", "qf_4"],
  semifinal: ["sf_1", "sf_2"],
  championship: ["championship"],
};

/** Which slot's stored pick becomes invalid (and must be cleared) if this slot's pick changes. */
export const DOWNSTREAM_SLOTS: Record<BracketSlot, BracketSlot[]> = {
  r1_5v12: ["qf_4", "sf_2", "championship"],
  r1_6v11: ["qf_3", "sf_2", "championship"],
  r1_7v10: ["qf_2", "sf_1", "championship"],
  r1_8v9: ["qf_1", "sf_1", "championship"],
  qf_1: ["sf_1", "championship"],
  qf_2: ["sf_1", "championship"],
  qf_3: ["sf_2", "championship"],
  qf_4: ["sf_2", "championship"],
  sf_1: ["championship"],
  sf_2: ["championship"],
  championship: [],
};

export type BracketSlotGame = {
  slot: BracketSlot;
  round: BracketRound;
  // Null if that side isn't determined yet -- an earlier round's pick
  // this game depends on hasn't been made.
  team1: Seed | null;
  team2: Seed | null;
  pickedWinner: Seed | null;
};

/**
 * Derives the full bracket tree from the 12 seeded teams plus whatever
 * picks have been made so far. Pure and re-derivable from scratch every
 * time -- there's no separate "current matchup" state to keep in sync,
 * just seeds + a slot->team_id map of picks.
 */
export function buildBracketState(
  seeds: Seed[],
  picks: Partial<Record<BracketSlot, number>>,
): BracketSlotGame[] {
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const byTeamId = new Map(seeds.map((s) => [s.teamId, s]));
  const winnerOf = (slot: BracketSlot): Seed | null => {
    const teamId = picks[slot];
    return teamId !== undefined ? (byTeamId.get(teamId) ?? null) : null;
  };
  const pickedFor = (slot: BracketSlot): Seed | null => {
    const teamId = picks[slot];
    return teamId !== undefined ? (byTeamId.get(teamId) ?? null) : null;
  };

  const games: BracketSlotGame[] = [];

  const round1: [BracketSlot, number, number][] = [
    ["r1_5v12", 5, 12],
    ["r1_6v11", 6, 11],
    ["r1_7v10", 7, 10],
    ["r1_8v9", 8, 9],
  ];
  for (const [slot, seedA, seedB] of round1) {
    games.push({
      slot,
      round: "round1",
      team1: bySeed.get(seedA) ?? null,
      team2: bySeed.get(seedB) ?? null,
      pickedWinner: pickedFor(slot),
    });
  }

  const quarterfinal: [BracketSlot, number, BracketSlot][] = [
    ["qf_1", 1, "r1_8v9"],
    ["qf_2", 2, "r1_7v10"],
    ["qf_3", 3, "r1_6v11"],
    ["qf_4", 4, "r1_5v12"],
  ];
  for (const [slot, byeSeed, feederSlot] of quarterfinal) {
    games.push({
      slot,
      round: "quarterfinal",
      team1: bySeed.get(byeSeed) ?? null,
      team2: winnerOf(feederSlot),
      pickedWinner: pickedFor(slot),
    });
  }

  games.push({
    slot: "sf_1",
    round: "semifinal",
    team1: winnerOf("qf_1"),
    team2: winnerOf("qf_2"),
    pickedWinner: pickedFor("sf_1"),
  });
  games.push({
    slot: "sf_2",
    round: "semifinal",
    team1: winnerOf("qf_3"),
    team2: winnerOf("qf_4"),
    pickedWinner: pickedFor("sf_2"),
  });

  games.push({
    slot: "championship",
    round: "championship",
    team1: winnerOf("sf_1"),
    team2: winnerOf("sf_2"),
    pickedWinner: pickedFor("championship"),
  });

  return games;
}

/** The first round (in order) that isn't fully picked yet -- null once the championship has a winner. */
export function currentBracketRound(
  games: BracketSlotGame[],
): BracketRound | null {
  for (const round of BRACKET_ROUNDS) {
    const roundGames = games.filter((g) => g.round === round);
    if (roundGames.some((g) => g.pickedWinner === null)) return round;
  }
  return null;
}
