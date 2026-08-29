import {
  computeComputerRankings,
  computeRankMovement,
  computeWeeklyRankings,
} from "./computerRankings";
import {
  computeEloRankMovement,
  computeEloRankings,
  computeWeeklyEloRankings,
} from "./eloRankings";
import type { Game, RankingRow, Team } from "./types";

/**
 * Which ranking model the app uses. Both implement the same interface, so
 * every consumer (rankings page, bracket seeding, movement arrows) can be
 * switched with one environment variable and compared on identical data.
 *
 * Set RANKING_MODEL=elo to use the rank-driven Elo ledger in
 * lib/eloRankings.ts. Anything else -- including unset -- keeps the
 * record-and-quality model in lib/computerRankings.ts, which is the one
 * every tuning decision to date was made against.
 *
 * Deliberately an env var rather than a per-user setting: the two models
 * disagree about the order of the same season, and two users comparing
 * boards built by different models would be comparing nothing.
 */
export type RankingModel = "record" | "elo";

export function activeRankingModel(): RankingModel {
  return process.env.RANKING_MODEL === "elo" ? "elo" : "record";
}

export function computeRankings(teams: Team[], games: Game[]): RankingRow[] {
  return activeRankingModel() === "elo"
    ? computeEloRankings(teams, games)
    : computeComputerRankings(teams, games);
}

export function computeMovement(
  teams: Team[],
  games: Game[],
): { current: RankingRow[]; movement: Map<number, number | null> } {
  return activeRankingModel() === "elo"
    ? computeEloRankMovement(teams, games)
    : computeRankMovement(teams, games);
}

export function computeWeekly(
  teams: Team[],
  games: Game[],
): { week: number; rankings: RankingRow[] }[] {
  return activeRankingModel() === "elo"
    ? computeWeeklyEloRankings(teams, games)
    : computeWeeklyRankings(teams, games);
}
