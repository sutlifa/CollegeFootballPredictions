import { computeColleyRatings } from "./colleyMatrix";
import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" = the Colley Matrix rating (see colleyMatrix.ts) --
 * one of the six official BCS computer polls, modeling the BCS's own
 * approach rather than the original spreadsheet's bespoke conference-tier
 * formula. Wins/losses shown alongside the score are each team's full
 * record (FCS opponents included); the rating itself only considers
 * FBS-vs-FBS games, matching how the real Colley/BCS system worked.
 */
export function computeComputerRankings(
  teams: Team[],
  games: Game[],
): RankingRow[] {
  const ratings = computeColleyRatings(teams, games);

  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  for (const game of games) {
    if (!isDecided(game)) continue;
    if (game.predictedScoreTeam1 === game.predictedScoreTeam2) continue;
    const winnerId =
      game.predictedScoreTeam1 > game.predictedScoreTeam2
        ? game.team1Id
        : game.team2Id;
    const loserId =
      game.predictedScoreTeam1 > game.predictedScoreTeam2
        ? game.team2Id
        : game.team1Id;
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
  }

  const sorted = teams
    .filter((t) => t.isFbs)
    .map((team) => ({
      team,
      score: ratings.get(team.id) ?? 0.5,
      wins: wins.get(team.id) ?? 0,
      losses: losses.get(team.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.team.name.localeCompare(b.team.name);
    });

  return sorted.map((row, i) => ({
    rank: i + 1,
    teamId: row.team.id,
    team: row.team.name,
    conference: row.team.conference,
    wins: row.wins,
    losses: row.losses,
    score: Math.round(row.score * 1000) / 1000,
  }));
}
