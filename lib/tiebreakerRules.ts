import { CHAMPIONSHIP_CONFERENCES, sunBeltDivision } from "./conferences";
import { computeConferenceStandings } from "./standings";
import type { Game, StandingsRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * Each of the 9 championship conferences breaks a conference-standings tie
 * with its own real, specific written procedure -- not a shared generic
 * chain. These were pulled from each conference's current official
 * tiebreaker policy (conference websites / football operations manuals).
 * Two things every one of them relies on that this app can't reproduce and
 * are deliberately SKIPPED, falling straight through to the next
 * real/computable step: (1) proprietary computer-ranking services
 * (SportSource Analytics Team Rating Score / Team Success Ranking,
 * Connelly/Connolly SP+, ESPN SOR, KPI), and (2) actual CFP Selection
 * Committee rankings. The SEC's capped relative scoring margin is the one
 * exception -- it's a fully public, computable formula (Appendix A of the
 * SEC's policy), not a third-party service, so it's implemented for real.
 * Every ladder's final step (a real coin toss / random draw, administered
 * by the conference) is stood in for by team name -- deterministic, and
 * consistent with how an unbreakable tie is already settled elsewhere in
 * this app (Standings, Computer Rankings).
 *
 * Procedures are expressed as an ORDERED sequence of "metric" steps: at
 * each step every team in the (still-tied) group gets a numeric score
 * (higher is better); the group splits into consecutive sub-groups of
 * teams still tied on that score; any sub-group of 2+ moves on. Whether it
 * moves on to the NEXT step, or restarts the WHOLE ladder from step one,
 * differs by conference -- see `restartAfterEachStep` below.
 *
 * This module is deliberately DB-free (pure functions of teams/games
 * already in hand) so it can be used both by the one-time finalization
 * pass (lib/conferenceTiebreakers.ts) AND by the live/preview derivation
 * (lib/deriveWeek16.ts) -- there's no reason the mid-season preview should
 * fall back to a cruder, no-real-tiebreaker ordering just because the
 * season isn't finished yet.
 */
export type TiebreakMetric = ((
  group: StandingsRow[],
  ctx: TiebreakContext,
) => Map<number, number>) & {
  /** Human-readable name shown in the "why" explanation on Standings -- see explainTiebreak. */
  label: string;
};

export type TiebreakContext = {
  /** Decided games covering the whole regular season (conference + non-conference). */
  games: Game[];
  teams: Team[];
  conference: string;
};

export type ConferenceProcedure = {
  twoWay: TiebreakMetric[];
  multiWay: TiebreakMetric[];
  /**
   * Some conferences (AAC, Mountain West) explicitly fold a 3+-way tie back
   * into the two-team procedure once it narrows to exactly 2 teams, rather
   * than continuing the multi-way ladder. Others use functionally the same
   * steps for both sizes anyway, so this is a no-op for them.
   */
  mergeToTwoWayWhenPairRemains?: boolean;
  /**
   * ACC, Big 12, Big Ten, MAC, and SEC all explicitly restart their entire
   * ladder from step one for whichever teams remain unresolved once a step
   * separates out a leader/trailer. The AAC, Mountain West, and Sun Belt
   * instead just continue down to the next step with the remaining teams.
   */
  restartAfterEachStep?: boolean;
};

function decidedGames(games: Game[]): Game[] {
  return games.filter(
    (g) => isDecided(g) && g.predictedScoreTeam1 !== g.predictedScoreTeam2,
  );
}

function winPct(games: Game[], teamId: number): number {
  if (games.length === 0) return -1; // sentinel: no data, never distinguishes
  let wins = 0;
  for (const g of games) {
    const won =
      g.team1Id === teamId
        ? g.predictedScoreTeam1! > g.predictedScoreTeam2!
        : g.predictedScoreTeam2! > g.predictedScoreTeam1!;
    if (won) wins++;
  }
  return wins / games.length;
}

function opponentId(g: Game, teamId: number): number {
  return g.team1Id === teamId ? g.team2Id : g.team1Id;
}

function gamesAgainst(games: Game[], teamId: number, opponentIds: Set<number>): Game[] {
  return decidedGames(games).filter(
    (g) =>
      (g.team1Id === teamId || g.team2Id === teamId) &&
      opponentIds.has(opponentId(g, teamId)),
  );
}

function conferenceOpponentIds(
  games: Game[],
  teamId: number,
  teamById: Map<number, Team>,
  conference: string,
): Set<number> {
  const ids = new Set<number>();
  for (const g of decidedGames(games)) {
    if (g.team1Id !== teamId && g.team2Id !== teamId) continue;
    const oppId = opponentId(g, teamId);
    const opp = teamById.get(oppId);
    if (opp?.isFbs && opp.conference === conference) ids.add(oppId);
  }
  return ids;
}

/**
 * Win percentage in games played against OTHER members of this tied group.
 * Two regimes, matching how every conference's policy actually describes
 * it: if every pair in the group has played (a complete "round robin" among
 * just the tied teams), a continuous win percentage is meaningful and used
 * directly. If the group is missing some of those games (common with
 * conference realignment -- nobody plays a full round robin anymore), only
 * a CLEAN sweep (or clean winlessness) against every other member counts;
 * a partial signal is treated as inconclusive for this step, exactly as
 * every conference's policy specifies ("group remains tied unless one team
 * defeated all other tied teams").
 */
export const headToHeadAmongGroup = ((group, ctx) => {
  const groupIds = new Set(group.map((r) => r.teamId));
  const fullRoundRobin = group.every((row) => {
    const others = new Set([...groupIds].filter((id) => id !== row.teamId));
    return gamesAgainst(ctx.games, row.teamId, others).length === others.size;
  });

  const result = new Map<number, number>();
  for (const row of group) {
    const others = new Set([...groupIds].filter((id) => id !== row.teamId));
    const games = gamesAgainst(ctx.games, row.teamId, others);
    if (fullRoundRobin) {
      result.set(row.teamId, winPct(games, row.teamId));
      continue;
    }
    const playedEveryone = others.size > 0 && games.length === others.size;
    if (!playedEveryone) {
      result.set(row.teamId, 0);
      continue;
    }
    const wins = games.filter(
      (g) =>
        (g.team1Id === row.teamId
          ? g.predictedScoreTeam1!
          : g.predictedScoreTeam2!) >
        (g.team1Id === row.teamId
          ? g.predictedScoreTeam2!
          : g.predictedScoreTeam1!),
    ).length;
    result.set(row.teamId, wins === games.length ? 1 : wins === 0 ? -1 : 0);
  }
  return result;
}) as TiebreakMetric;
headToHeadAmongGroup.label = "Head-to-head";

/** Win percentage against CONFERENCE opponents common to every team in the group. */
export const commonConferenceOpponentsWinPct = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const opponentSets = group.map((row) =>
    conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference),
  );
  const common = opponentSets.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));

  const result = new Map<number, number>();
  for (const row of group) {
    result.set(row.teamId, winPct(gamesAgainst(ctx.games, row.teamId, common), row.teamId));
  }
  return result;
}) as TiebreakMetric;
commonConferenceOpponentsWinPct.label = "Record vs. common conference opponents";

/** Win percentage in ALL conference games (conference-wide, not just common opponents). */
export const fullConferenceRecordPct = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const result = new Map<number, number>();
  for (const row of group) {
    const opponents = conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference);
    result.set(row.teamId, winPct(gamesAgainst(ctx.games, row.teamId, opponents), row.teamId));
  }
  return result;
}) as TiebreakMetric;
fullConferenceRecordPct.label = "Overall conference record";

/** Win percentage across the full schedule (conference + non-conference). */
export const overallRecordPct = ((group, ctx) => {
  const result = new Map<number, number>();
  for (const row of group) {
    const games = decidedGames(ctx.games).filter(
      (g) => g.team1Id === row.teamId || g.team2Id === row.teamId,
    );
    result.set(row.teamId, winPct(games, row.teamId));
  }
  return result;
}) as TiebreakMetric;
overallRecordPct.label = "Overall record";

/** Same as overallRecordPct, but games against a non-FBS opponent don't count at all. */
export const overallRecordPctFbsOnly = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const result = new Map<number, number>();
  for (const row of group) {
    const games = decidedGames(ctx.games).filter((g) => {
      if (g.team1Id !== row.teamId && g.team2Id !== row.teamId) return false;
      return teamById.get(opponentId(g, row.teamId))?.isFbs ?? false;
    });
    result.set(row.teamId, winPct(games, row.teamId));
  }
  return result;
}) as TiebreakMetric;
overallRecordPctFbsOnly.label = "Overall record vs. FBS opponents";

/**
 * "Strength of conference schedule": the average conference winning
 * percentage OF each team's own conference opponents (not the team's own
 * record -- several conferences use this exact wording, and it's a no-op
 * otherwise since the whole point is comparing two teams who already have
 * an identical conference record).
 */
export const cumulativeOpponentConferenceWinPct = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const result = new Map<number, number>();
  for (const row of group) {
    const opponents = [...conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference)];
    if (opponents.length === 0) {
      result.set(row.teamId, -1);
      continue;
    }
    const pcts = opponents.map((oppId) => {
      const oppOpponents = conferenceOpponentIds(ctx.games, oppId, teamById, ctx.conference);
      return winPct(gamesAgainst(ctx.games, oppId, oppOpponents), oppId);
    });
    result.set(row.teamId, pcts.reduce((a, b) => a + Math.max(0, b), 0) / pcts.length);
  }
  return result;
}) as TiebreakMetric;
cumulativeOpponentConferenceWinPct.label = "Strength of conference schedule";

/**
 * Big 12-specific: total win count (conference + non-conference) in a
 * 12-game season, except only one win against a non-FBS opponent counts --
 * any additional FCS-or-lower win is excluded.
 */
export const big12TotalWins = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const result = new Map<number, number>();
  for (const row of group) {
    const games = decidedGames(ctx.games).filter(
      (g) => g.team1Id === row.teamId || g.team2Id === row.teamId,
    );
    let fbsWins = 0;
    let fcsWins = 0;
    for (const g of games) {
      const won =
        g.team1Id === row.teamId
          ? g.predictedScoreTeam1! > g.predictedScoreTeam2!
          : g.predictedScoreTeam2! > g.predictedScoreTeam1!;
      if (!won) continue;
      const opp = teamById.get(opponentId(g, row.teamId));
      if (opp?.isFbs) fbsWins++;
      else fcsWins++;
    }
    result.set(row.teamId, fbsWins + Math.min(1, fcsWins));
  }
  return result;
}) as TiebreakMetric;
big12TotalWins.label = "Total wins";

/**
 * SEC-specific: the one proprietary-sounding step that's actually a fully
 * public, computable formula (SEC Tiebreaker Policy, Appendix A). For each
 * conference game, relative scoring offense = 100 * (points scored / that
 * game's opponent's SEASON-AVERAGE points allowed), capped at 200%;
 * relative scoring defense = 100 * (points allowed / that opponent's
 * season-average points scored), uncapped (naturally floors near 0).
 * Margin = offense - defense, averaged over all of a team's conference
 * games.
 */
export const secCappedScoringMargin = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const allDecided = decidedGames(ctx.games);

  function seasonAverages(teamId: number): { avgScored: number; avgAllowed: number } {
    const games = allDecided.filter((g) => g.team1Id === teamId || g.team2Id === teamId);
    if (games.length === 0) return { avgScored: 0, avgAllowed: 0 };
    let scored = 0;
    let allowed = 0;
    for (const g of games) {
      const isTeam1 = g.team1Id === teamId;
      scored += isTeam1 ? g.predictedScoreTeam1! : g.predictedScoreTeam2!;
      allowed += isTeam1 ? g.predictedScoreTeam2! : g.predictedScoreTeam1!;
    }
    return { avgScored: scored / games.length, avgAllowed: allowed / games.length };
  }

  const result = new Map<number, number>();
  for (const row of group) {
    const opponents = conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference);
    const games = gamesAgainst(ctx.games, row.teamId, opponents);
    if (games.length === 0) {
      result.set(row.teamId, -Infinity);
      continue;
    }
    let totalMargin = 0;
    for (const g of games) {
      const isTeam1 = g.team1Id === row.teamId;
      const scored = isTeam1 ? g.predictedScoreTeam1! : g.predictedScoreTeam2!;
      const allowed = isTeam1 ? g.predictedScoreTeam2! : g.predictedScoreTeam1!;
      const oppId = opponentId(g, row.teamId);
      const oppAvg = seasonAverages(oppId);
      const offensePct = Math.min(200, oppAvg.avgAllowed > 0 ? (100 * scored) / oppAvg.avgAllowed : 200);
      const defensePct = oppAvg.avgScored > 0 ? (100 * allowed) / oppAvg.avgScored : 0;
      totalMargin += offensePct - defensePct;
    }
    result.set(row.teamId, totalMargin / games.length);
  }
  return result;
}) as TiebreakMetric;
secCappedScoringMargin.label = "Scoring margin";

/**
 * Sun Belt-specific: win percentage in DIVISION-ONLY conference games (as
 * opposed to the whole-conference record used to build the initial
 * standings/grouping).
 */
export const sunBeltDivisionOnlyRecordPct = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const division = sunBeltDivision(group[0].team);
  const result = new Map<number, number>();
  for (const row of group) {
    const opponents = [...conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference)]
      .filter((id) => sunBeltDivision(teamById.get(id)?.name ?? "") === division);
    result.set(row.teamId, winPct(gamesAgainst(ctx.games, row.teamId, new Set(opponents)), row.teamId));
  }
  return result;
}) as TiebreakMetric;
sunBeltDivisionOnlyRecordPct.label = "Division record";

/** Sun Belt-specific: win percentage against common opponents in the OTHER division. */
export const sunBeltCommonNonDivisionalOpponentsWinPct = ((group, ctx) => {
  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const division = sunBeltDivision(group[0].team);
  const opponentSets = group.map((row) => {
    const all = conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference);
    return new Set([...all].filter((id) => sunBeltDivision(teamById.get(id)?.name ?? "") !== division));
  });
  const common = opponentSets.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));

  const result = new Map<number, number>();
  for (const row of group) {
    result.set(row.teamId, winPct(gamesAgainst(ctx.games, row.teamId, common), row.teamId));
  }
  return result;
}) as TiebreakMetric;
sunBeltCommonNonDivisionalOpponentsWinPct.label = "Common non-divisional opponents";

/**
 * "Record against the next-highest-placed common opponent in the
 * standings, proceeding through the standings" -- used (with slightly
 * different phrasing) by the Big 12, Big Ten, MAC, Mountain West, SEC, and
 * Sun Belt. `baseline` is the conference's (or division's) own standings
 * order ignoring further tiebreaks -- just enough to know which opponents
 * rank above which others. Walks opponent-tiers from best to worst; the
 * first tier that distinguishes the group is the answer, otherwise this
 * step is inconclusive (falls through to whatever's next).
 */
export function recordVsCommonOpponentsByStandingsOrder(
  baseline: StandingsRow[],
): TiebreakMetric {
  const metric = ((group, ctx) => {
    const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
    const opponentSets = group.map((row) =>
      conferenceOpponentIds(ctx.games, row.teamId, teamById, ctx.conference),
    );
    const common = opponentSets.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));
    if (common.size === 0) return new Map(group.map((r) => [r.teamId, 0]));

    // Group common opponents into standings tiers (opponents with the same
    // conf record are considered together, per every conference's own
    // "compare against the group collectively" rule for this exact case).
    const tierOf = new Map<number, number>();
    let tier = 0;
    let prevKey = "";
    for (const row of baseline) {
      const key = `${row.confWins}-${row.confLosses}`;
      if (key !== prevKey) tier++;
      prevKey = key;
      if (common.has(row.teamId)) tierOf.set(row.teamId, tier);
    }
    const tiers = [...new Set(tierOf.values())].sort((a, b) => a - b);

    for (const t of tiers) {
      const tierOpponents = new Set([...common].filter((id) => tierOf.get(id) === t));
      const scores = group.map((row) => winPct(gamesAgainst(ctx.games, row.teamId, tierOpponents), row.teamId));
      if (new Set(scores).size > 1) {
        return new Map(group.map((row, i) => [row.teamId, scores[i]]));
      }
    }
    return new Map(group.map((r) => [r.teamId, 0]));
  }) as TiebreakMetric;
  metric.label = "Record vs. next-best common opponent";
  return metric;
}

const CONFERENCE_TIEBREAK_PROCEDURES: Partial<
  Record<(typeof CHAMPIONSHIP_CONFERENCES)[number], ConferenceProcedure>
> = {
  ACC: {
    twoWay: [headToHeadAmongGroup],
    multiWay: [headToHeadAmongGroup],
    restartAfterEachStep: true,
  },
  American: {
    twoWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, overallRecordPct],
    multiWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, overallRecordPct],
    mergeToTwoWayWhenPairRemains: true,
  },
  CUSA: {
    twoWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, cumulativeOpponentConferenceWinPct],
    multiWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, cumulativeOpponentConferenceWinPct],
    restartAfterEachStep: true,
  },
  MAC: {
    twoWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, cumulativeOpponentConferenceWinPct],
    multiWay: [headToHeadAmongGroup, commonConferenceOpponentsWinPct, cumulativeOpponentConferenceWinPct],
    restartAfterEachStep: true,
  },
  "Mountain West": {
    twoWay: [headToHeadAmongGroup, overallRecordPct, commonConferenceOpponentsWinPct],
    multiWay: [headToHeadAmongGroup, overallRecordPct, commonConferenceOpponentsWinPct],
    mergeToTwoWayWhenPairRemains: true,
  },
  "Sun Belt": {
    twoWay: [
      headToHeadAmongGroup,
      sunBeltDivisionOnlyRecordPct,
      sunBeltCommonNonDivisionalOpponentsWinPct,
      overallRecordPctFbsOnly,
    ],
    multiWay: [
      headToHeadAmongGroup,
      sunBeltDivisionOnlyRecordPct,
      sunBeltCommonNonDivisionalOpponentsWinPct,
      overallRecordPctFbsOnly,
    ],
  },
  // Big 12, Big Ten, and SEC each also use `recordVsCommonOpponentsByStandingsOrder`,
  // which needs that conference's own baseline standings -- built per-call
  // in resolveConferenceStandingsWithTiebreakers rather than here.
};

function buildProcedureWithStandingsStep(
  conference: (typeof CHAMPIONSHIP_CONFERENCES)[number],
  baseline: StandingsRow[],
): ConferenceProcedure | undefined {
  const byStandings = recordVsCommonOpponentsByStandingsOrder(baseline);
  if (conference === "Big 12") {
    const steps = [
      headToHeadAmongGroup,
      commonConferenceOpponentsWinPct,
      byStandings,
      cumulativeOpponentConferenceWinPct,
      big12TotalWins,
    ];
    return { twoWay: steps, multiWay: steps, restartAfterEachStep: true };
  }
  if (conference === "Big Ten") {
    const steps = [
      headToHeadAmongGroup,
      commonConferenceOpponentsWinPct,
      byStandings,
      cumulativeOpponentConferenceWinPct,
    ];
    return { twoWay: steps, multiWay: steps, restartAfterEachStep: true };
  }
  if (conference === "SEC") {
    const steps = [
      headToHeadAmongGroup,
      commonConferenceOpponentsWinPct,
      byStandings,
      cumulativeOpponentConferenceWinPct,
      secCappedScoringMargin,
    ];
    return { twoWay: steps, multiWay: steps, restartAfterEachStep: true };
  }
  return CONFERENCE_TIEBREAK_PROCEDURES[conference];
}

function applyStepList(
  group: StandingsRow[],
  steps: TiebreakMetric[],
  ctx: TiebreakContext,
  restart: boolean,
  twoWayFallback: TiebreakMetric[] | undefined,
): StandingsRow[] {
  if (group.length <= 1) return group;
  if (twoWayFallback && group.length === 2) {
    return applyStepList(group, twoWayFallback, ctx, false, undefined);
  }
  if (steps.length === 0) {
    return [...group].sort((a, b) => a.team.localeCompare(b.team));
  }

  const [step, ...rest] = steps;
  const scores = step(group, ctx);
  const sorted = [...group].sort((a, b) => scores.get(b.teamId)! - scores.get(a.teamId)!);

  const result: StandingsRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && scores.get(sorted[j].teamId) === scores.get(sorted[i].teamId)) {
      j++;
    }
    const subGroup = sorted.slice(i, j);
    const separated = subGroup.length < group.length;
    const nextSteps = separated && restart ? steps : rest;
    result.push(...applyStepList(subGroup, nextSteps, ctx, restart, twoWayFallback));
    i = j;
  }
  return result;
}

function resolveGroup(
  group: StandingsRow[],
  procedure: ConferenceProcedure,
  ctx: TiebreakContext,
): StandingsRow[] {
  const steps = group.length === 2 ? procedure.twoWay : procedure.multiWay;
  const twoWayFallback = procedure.mergeToTwoWayWhenPairRemains ? procedure.twoWay : undefined;
  return applyStepList(group, steps, ctx, procedure.restartAfterEachStep ?? false, twoWayFallback);
}

function groupTiedTeams(baseline: StandingsRow[]): StandingsRow[][] {
  const groups: StandingsRow[][] = [];
  let i = 0;
  while (i < baseline.length) {
    let j = i + 1;
    while (
      j < baseline.length &&
      baseline[j].confWins === baseline[i].confWins &&
      baseline[j].confLosses === baseline[i].confLosses
    ) {
      j++;
    }
    groups.push(baseline.slice(i, j));
    i = j;
  }
  return groups;
}

/**
 * Full conference standings with real tiebreakers applied: teams are first
 * grouped by conference record (the same conf-wins/conf-losses grouping
 * Standings uses), and any group of 2+ tied teams is ordered by that
 * conference's own tiebreak procedure instead of the generic
 * record/preseason-rank/name chain.
 */
export function resolveConferenceStandingsWithTiebreakers(
  teams: Team[],
  games: Game[],
  conference: string,
): StandingsRow[] {
  const baseline = computeConferenceStandings(teams, games, conference);
  const procedure = buildProcedureWithStandingsStep(
    conference as (typeof CHAMPIONSHIP_CONFERENCES)[number],
    baseline,
  );
  if (!procedure) return baseline;

  const ctx: TiebreakContext = { games, teams, conference };
  const result: StandingsRow[] = [];
  for (const group of groupTiedTeams(baseline)) {
    result.push(...resolveGroup(group, procedure, ctx));
  }
  return result;
}

/**
 * Sun Belt-only: standings for one division (East or West), ranked by
 * whole-conference record (matching the Sun Belt's own rule that a
 * division champion is "the team with the highest winning percentage in
 * ALL conference games, both divisional and non-divisional"), with the
 * Sun Belt's own tiebreak procedure applied within that division.
 */
export function resolveSunBeltDivisionStandings(
  teams: Team[],
  games: Game[],
  division: "East" | "West",
): StandingsRow[] {
  const baseline = computeConferenceStandings(teams, games, "Sun Belt").filter(
    (row) => sunBeltDivision(row.team) === division,
  );
  const procedure = CONFERENCE_TIEBREAK_PROCEDURES["Sun Belt"]!;
  const ctx: TiebreakContext = { games, teams, conference: "Sun Belt" };
  const result: StandingsRow[] = [];
  for (const group of groupTiedTeams(baseline)) {
    result.push(...resolveGroup(group, procedure, ctx));
  }
  return result;
}

/**
 * Human-readable explanation of why one team currently ranks above another
 * when the two share the same conference record -- e.g. "Ohio State leads
 * Oregon: Head-to-head (won 31-28)". Returns null when there's nothing to
 * explain (different records -- no tie to break -- or the two aren't even
 * competing for the same spot, like Sun Belt teams in different
 * divisions). Purely informational: recomputes the SAME conference
 * procedure used everywhere else, restricted to just this one pair, so a
 * two-team tie's explanation always exactly matches how it was actually
 * resolved.
 */
export function explainTiebreak(
  teamAId: number,
  teamBId: number,
  teams: Team[],
  games: Game[],
  conference: string,
  /**
   * That conference's (or Sun Belt division's) standings rows, if the
   * caller already has them -- saves recomputing the whole conference's
   * standings once per explained pair, which is the bulk of this
   * function's cost. Safe to pass the already-tiebreaker-RESOLVED rows:
   * resolving only reorders teams *within* an equal-record group, so the
   * record-based tiering the procedure depends on is identical either way.
   */
  precomputedStandings?: StandingsRow[],
): string | null {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const isSunBelt = conference === "Sun Belt";
  const division = isSunBelt ? sunBeltDivision(teamById.get(teamAId)?.name ?? "") : null;
  if (isSunBelt) {
    if (!division || sunBeltDivision(teamById.get(teamBId)?.name ?? "") !== division) {
      return null; // different divisions -- not competing for the same title
    }
  }

  const baseline =
    precomputedStandings ??
    (isSunBelt
      ? computeConferenceStandings(teams, games, "Sun Belt").filter(
          (row) => sunBeltDivision(row.team) === division,
        )
      : computeConferenceStandings(teams, games, conference));

  const a = baseline.find((r) => r.teamId === teamAId);
  const b = baseline.find((r) => r.teamId === teamBId);
  if (!a || !b) return null;
  if (a.confWins !== b.confWins || a.confLosses !== b.confLosses) return null;

  const procedure = buildProcedureWithStandingsStep(
    conference as (typeof CHAMPIONSHIP_CONFERENCES)[number],
    baseline,
  );
  if (!procedure) return null;

  const ctx: TiebreakContext = { games, teams, conference };
  const group = [a, b];
  for (const step of procedure.twoWay) {
    const scores = step(group, ctx);
    const scoreA = scores.get(a.teamId)!;
    const scoreB = scores.get(b.teamId)!;
    if (scoreA === scoreB) continue;

    const leader = scoreA > scoreB ? a : b;
    const trailer = scoreA > scoreB ? b : a;
    if (step === headToHeadAmongGroup) {
      const h2h = decidedGames(games).find(
        (g) =>
          (g.team1Id === teamAId && g.team2Id === teamBId) ||
          (g.team1Id === teamBId && g.team2Id === teamAId),
      );
      if (h2h) {
        const leaderScore =
          h2h.team1Id === leader.teamId ? h2h.predictedScoreTeam1! : h2h.predictedScoreTeam2!;
        const trailerScore =
          h2h.team1Id === leader.teamId ? h2h.predictedScoreTeam2! : h2h.predictedScoreTeam1!;
        return `${leader.team} leads ${trailer.team}: head-to-head, won ${leaderScore}-${trailerScore}`;
      }
    }
    return `${leader.team} leads ${trailer.team}: ${step.label}`;
  }
  return `${a.team} and ${b.team} are tied through every tiebreaker step this app can compute (${conference} steps that need a proprietary ranking service or the CFP committee's poll are skipped) -- ordered alphabetically here; in practice a coin toss or draw would decide it`;
}
