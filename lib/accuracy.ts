import type { Game, Team } from "./types";

export type AccuracyRow = {
  gameId: number;
  week: number;
  team1: string;
  team2: string;
  predictedScoreTeam1: number;
  predictedScoreTeam2: number;
  actualScoreTeam1: number;
  actualScoreTeam2: number;
  correctWinner: boolean;
  absoluteError: number; // combined |predicted - actual| across both teams
};

export type AccuracySummary = {
  gamesComparable: number;
  correctWinnerRate: number | null; // null if no comparable games yet
  averageAbsoluteError: number | null;
  rows: AccuracyRow[];
};

export function computeAccuracySummary(
  teams: Team[],
  games: Game[],
): AccuracySummary {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rows: AccuracyRow[] = [];

  for (const game of games) {
    if (
      game.predictedScoreTeam1 === null ||
      game.predictedScoreTeam2 === null ||
      game.actualScoreTeam1 === null ||
      game.actualScoreTeam2 === null
    ) {
      continue;
    }
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    const predictedWinnerIsTeam1 =
      game.predictedScoreTeam1 > game.predictedScoreTeam2;
    const actualWinnerIsTeam1 = game.actualScoreTeam1 > game.actualScoreTeam2;

    rows.push({
      gameId: game.id,
      week: game.week,
      team1: team1.name,
      team2: team2.name,
      predictedScoreTeam1: game.predictedScoreTeam1,
      predictedScoreTeam2: game.predictedScoreTeam2,
      actualScoreTeam1: game.actualScoreTeam1,
      actualScoreTeam2: game.actualScoreTeam2,
      correctWinner: predictedWinnerIsTeam1 === actualWinnerIsTeam1,
      absoluteError:
        Math.abs(game.predictedScoreTeam1 - game.actualScoreTeam1) +
        Math.abs(game.predictedScoreTeam2 - game.actualScoreTeam2),
    });
  }

  const gamesComparable = rows.length;
  const correctWinnerRate = gamesComparable
    ? rows.filter((r) => r.correctWinner).length / gamesComparable
    : null;
  const averageAbsoluteError = gamesComparable
    ? rows.reduce((sum, r) => sum + r.absoluteError, 0) / gamesComparable
    : null;

  return {
    gamesComparable,
    correctWinnerRate,
    averageAbsoluteError,
    rows: rows.sort((a, b) => a.week - b.week),
  };
}
