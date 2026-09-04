/**
 * The single season total, once real results exist: one number per person
 * built from the four things they were actually asked to predict.
 *
 *   games      -- every winner they got right
 *   margins    -- of those, the ones where the margin bucket landed too
 *   conference -- each conference title game they called correctly
 *   playoff    -- how many of their hand-picked 12 made the real CFP field,
 *                 plus the national champion
 *
 * The running Leaderboard percentages answer "how accurate are you"; this
 * answers "who is winning", which is a different question -- 900 games at
 * one point each would otherwise drown out the postseason entirely, so the
 * postseason pieces are worth far more per pick. A conference title is 25
 * because there are only ten to get, and a playoff team 15 because there
 * are only twelve; both are much harder calls than any single regular
 * season game. (The count scored is always whatever real title games have
 * actually finished -- see conferenceChampionsPossible -- so it follows
 * CHAMPIONSHIP_CONFERENCES rather than being pinned to a number here.)
 *
 * All of it is pure: results in, points out, no database.
 */

export const SEASON_POINTS = {
  /** Per game where the winning team was picked correctly. */
  correctWinner: 1,
  /** Extra, per correctly-picked game whose margin bucket also matched. */
  correctMargin: 1,
  /** Per conference whose champion they named. */
  conferenceChampion: 25,
  /** Per team of their 12 that actually made the playoff field. */
  playoffFieldTeam: 15,
  /** For calling the national champion. */
  nationalChampion: 100,
} as const;

export type SeasonScoreRow = {
  userId: number;
  displayName: string;
  correctWinners: number;
  correctMargins: number;
  conferenceChampions: number;
  /** Conference title games that have a real result to be scored against. */
  conferenceChampionsPossible: number;
  playoffFieldTeams: number;
  playoffFieldPossible: number;
  nationalChampionCorrect: boolean;
  gamePoints: number;
  marginPoints: number;
  conferencePoints: number;
  playoffPoints: number;
  championPoints: number;
  total: number;
};

export type SeasonScoreInput = {
  userId: number;
  displayName: string;
  correctWinners: number;
  correctMargins: number;
  /** This user's Week 16 picks: which conference, and who they had winning. */
  conferencePicks: {
    conference: string;
    predictedWinnerTeamId: number | null;
  }[];
  /** Their confirmed 12-team playoff field, if they set one. */
  playoffTeamIds: number[];
  championPickTeamId: number | null;
};

export type SeasonScoreTruth = {
  /** Real champion per conference, once known. */
  realChampionByConference: Map<string, number>;
  /** The real 12-team playoff field, once known. */
  realPlayoffField: number[] | null;
  realNationalChampionTeamId: number | null;
};

export function scoreSeason(
  users: SeasonScoreInput[],
  truth: SeasonScoreTruth,
): SeasonScoreRow[] {
  const realField = new Set(truth.realPlayoffField ?? []);

  return users
    .map((user): SeasonScoreRow => {
      // Only conferences whose real result is in can be scored -- an
      // unplayed title game shouldn't read as a miss.
      let conferenceChampions = 0;
      let conferenceChampionsPossible = 0;
      for (const pick of user.conferencePicks) {
        const real = truth.realChampionByConference.get(pick.conference);
        if (real === undefined) continue;
        conferenceChampionsPossible++;
        if (pick.predictedWinnerTeamId === real) conferenceChampions++;
      }

      const playoffFieldTeams = truth.realPlayoffField
        ? user.playoffTeamIds.filter((id) => realField.has(id)).length
        : 0;
      const playoffFieldPossible = truth.realPlayoffField
        ? truth.realPlayoffField.length
        : 0;

      const nationalChampionCorrect =
        user.championPickTeamId !== null &&
        truth.realNationalChampionTeamId !== null &&
        user.championPickTeamId === truth.realNationalChampionTeamId;

      const gamePoints = user.correctWinners * SEASON_POINTS.correctWinner;
      const marginPoints = user.correctMargins * SEASON_POINTS.correctMargin;
      const conferencePoints =
        conferenceChampions * SEASON_POINTS.conferenceChampion;
      const playoffPoints = playoffFieldTeams * SEASON_POINTS.playoffFieldTeam;
      const championPoints = nationalChampionCorrect
        ? SEASON_POINTS.nationalChampion
        : 0;

      return {
        userId: user.userId,
        displayName: user.displayName,
        correctWinners: user.correctWinners,
        correctMargins: user.correctMargins,
        conferenceChampions,
        conferenceChampionsPossible,
        playoffFieldTeams,
        playoffFieldPossible,
        nationalChampionCorrect,
        gamePoints,
        marginPoints,
        conferencePoints,
        playoffPoints,
        championPoints,
        total:
          gamePoints +
          marginPoints +
          conferencePoints +
          playoffPoints +
          championPoints,
      };
    })
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
}
