/**
 * End-of-season bonus scoring. Ground truth (who actually won each
 * conference title, who actually made the real playoff field, who actually
 * survived each round, who actually won the national title) is entered by
 * the site admin as results become known -- see app/api/admin/real-results.
 * None of this affects the running Leaderboard (correct-pick % + margin
 * error); it's a separate, additive bonus tally shown once ground truth
 * exists.
 *
 * Point values below are reasonable defaults, not something the real CFP
 * assigns -- easy to retune in one place.
 */

export const CONFERENCE_MATCHUP_POINTS = 5;
export const CONFERENCE_CHAMPION_POINTS = 10;

export type ConferenceBonusRow = {
  conference: string;
  matchupCorrect: boolean;
  championCorrect: boolean;
  points: number;
};

export type RealConferenceResult = {
  conference: string;
  championTeamId: number;
  runnerUpTeamId: number;
};

/** This user's own Week 16 pick for one conference: which two teams they had in it, and who they picked to win. */
export type UserConferencePick = {
  conference: string;
  team1Id: number;
  team2Id: number;
  predictedScoreTeam1: number | null;
  predictedScoreTeam2: number | null;
};

export function scoreConferenceTitleBonus(
  userPicks: UserConferencePick[],
  realResults: RealConferenceResult[],
): ConferenceBonusRow[] {
  const realByConference = new Map(realResults.map((r) => [r.conference, r]));

  return userPicks
    .map((pick): ConferenceBonusRow | null => {
      const real = realByConference.get(pick.conference);
      if (!real) return null;

      const pickedPair = new Set([pick.team1Id, pick.team2Id]);
      const matchupCorrect =
        pickedPair.has(real.championTeamId) &&
        pickedPair.has(real.runnerUpTeamId);

      const hasWinnerPick =
        pick.predictedScoreTeam1 !== null && pick.predictedScoreTeam2 !== null;
      const pickedWinnerId = hasWinnerPick
        ? pick.predictedScoreTeam1! > pick.predictedScoreTeam2!
          ? pick.team1Id
          : pick.team2Id
        : null;
      const championCorrect = pickedWinnerId === real.championTeamId;

      const points =
        (matchupCorrect ? CONFERENCE_MATCHUP_POINTS : 0) +
        (championCorrect ? CONFERENCE_CHAMPION_POINTS : 0);

      return { conference: pick.conference, matchupCorrect, championCorrect, points };
    })
    .filter((row): row is ConferenceBonusRow => row !== null);
}

export type PlayoffRound = "field" | "quarterfinal" | "semifinal" | "championship";
export const PLAYOFF_ROUNDS: readonly PlayoffRound[] = [
  "field",
  "quarterfinal",
  "semifinal",
  "championship",
];

/** Points awarded per one of the user's original 12 picks that's still alive at this checkpoint -- later rounds are worth more since surviving is harder. */
export const PLAYOFF_ROUND_POINTS: Record<PlayoffRound, number> = {
  field: 3,
  quarterfinal: 5,
  semifinal: 8,
  championship: 12,
};
export const NATIONAL_CHAMPION_POINTS = 50;

export type PlayoffRoundScore = {
  round: PlayoffRound;
  /** How many of the user's original 12 picks are in this round's real field. */
  correct: number;
  /** Real field size at this checkpoint (12, 8, 4, or 2). */
  total: number;
  points: number;
};

export type PlayoffBonus = {
  rounds: PlayoffRoundScore[];
  championPickCorrect: boolean;
  championPoints: number;
  totalPoints: number;
};

/**
 * "Predicting the actual matchups is near impossible, so we just go by how
 * many teams you had correct in each round" -- this never checks who played
 * whom, only whether a team the user originally picked is still present in
 * the real field at each checkpoint.
 */
export function scorePlayoffBonus(
  pickedTeamIds: number[],
  championPickTeamId: number | null,
  realRounds: Partial<Record<PlayoffRound, number[]>>,
  realNationalChampionTeamId: number | null,
): PlayoffBonus {
  const pickedSet = new Set(pickedTeamIds);

  const rounds = PLAYOFF_ROUNDS.map((round): PlayoffRoundScore => {
    const realIds = realRounds[round];
    const total = realIds?.length ?? 0;
    const correct = realIds
      ? realIds.filter((id) => pickedSet.has(id)).length
      : 0;
    return { round, correct, total, points: correct * PLAYOFF_ROUND_POINTS[round] };
  });

  const championPickCorrect =
    championPickTeamId !== null &&
    realNationalChampionTeamId !== null &&
    championPickTeamId === realNationalChampionTeamId;
  const championPoints = championPickCorrect ? NATIONAL_CHAMPION_POINTS : 0;

  const totalPoints =
    rounds.reduce((sum, r) => sum + r.points, 0) + championPoints;

  return { rounds, championPickCorrect, championPoints, totalPoints };
}
