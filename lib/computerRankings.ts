import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" = an Elo-style rating, seeded from each team's real
 * 2026 preseason rank (or a conference-tier baseline for unranked FBS teams,
 * or a flat low baseline for FCS/non-FBS opponents), then updated one
 * submitted week at a time.
 *
 * This is the "human factor" layered on top of a computer model: Elo's
 * expected-outcome math already does most of the work --
 *  - beating a team rated far above you swings your rating a lot; beating
 *    a team rated far below you (an FCS team, most of all) barely moves it
 *  - losing to a team rated far above you barely hurts; losing to a team
 *    rated far below you (an upset) hurts a lot
 *  - a team's rating reflects its conference indirectly (Power-4 baselines
 *    start higher than Group-of-5, which start higher than FCS), so
 *    "tougher conference" opponents are automatically worth more without a
 *    hardcoded table of exceptions
 *
 * Games are processed in week order (only weeks the caller has already
 * filtered down to "submitted" ones are included), so the rating path
 * mirrors how a real season actually unfolds rather than being computed
 * from the final win/loss tally alone.
 */

// The #25 team's rating from the formula below (1712 - 24*14 = 1376) --
// every unranked-team baseline is anchored below this so an unranked team
// (e.g. Michigan State, not in the AP preseason poll) can never start
// rated above an actually-ranked team (e.g. Michigan at #16), no matter
// how strong its conference's baseline tier is.
const RANK_FLOOR = 1712 - 24 * 14;

const CONFERENCE_BASELINE: Record<string, number> = {
  "Big Ten": RANK_FLOOR - 10,
  SEC: RANK_FLOOR - 10,
  ACC: RANK_FLOOR - 30,
  "Big 12": RANK_FLOOR - 30,
  Independent: RANK_FLOOR - 30,
  American: RANK_FLOOR - 70,
  "Pac 12": RANK_FLOOR - 70,
  "Mountain West": RANK_FLOOR - 80,
  "Sun Belt": RANK_FLOOR - 100,
  MAC: RANK_FLOOR - 110,
  CUSA: RANK_FLOOR - 110,
};
const DEFAULT_BASELINE = RANK_FLOOR - 90;
const FCS_BASELINE = 1100;

// Rating-points edge given to the home team's expected-score calculation
// only (not a flat bonus after the fact) -- a standard Elo-for-football
// adjustment, roughly matching commonly published home-field values.
const HOME_FIELD_ADVANTAGE = 65;

// Bigger than chess's usual 32: a ~13-game college season needs each result
// to move the needle more than a many-hundred-game chess rating pool would.
const K_FACTOR = 40;

function initialRating(team: Team): number {
  if (!team.isFbs) return FCS_BASELINE;
  if (team.preseasonRank) {
    // #1 ~= 1712, #25 ~= 1376, roughly a 14-point step per rank.
    return 1712 - (team.preseasonRank - 1) * 14;
  }
  return CONFERENCE_BASELINE[team.conference] ?? DEFAULT_BASELINE;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function computeComputerRankings(
  teams: Team[],
  games: Game[],
): RankingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const ratings = new Map<number, number>();
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();

  for (const team of teams) {
    ratings.set(team.id, initialRating(team));
    wins.set(team.id, 0);
    losses.set(team.id, 0);
  }

  const decided = games
    .filter(isDecided)
    .filter((g) => g.predictedScoreTeam1 !== g.predictedScoreTeam2)
    .sort((a, b) => a.week - b.week || a.id - b.id);

  for (const game of decided) {
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    const winner = team1Won ? team1 : team2;
    const loser = team1Won ? team2 : team1;
    wins.set(winner.id, (wins.get(winner.id) ?? 0) + 1);
    losses.set(loser.id, (losses.get(loser.id) ?? 0) + 1);

    let team1Effective = ratings.get(team1.id)!;
    let team2Effective = ratings.get(team2.id)!;
    if (!game.isNeutralSite) {
      if (game.team1IsHome === true) team1Effective += HOME_FIELD_ADVANTAGE;
      else if (game.team1IsHome === false) team2Effective += HOME_FIELD_ADVANTAGE;
    }
    const winnerEffective = team1Won ? team1Effective : team2Effective;
    const loserEffective = team1Won ? team2Effective : team1Effective;

    const expectedWinner = expectedScore(winnerEffective, loserEffective);
    const delta = K_FACTOR * (1 - expectedWinner);

    ratings.set(winner.id, ratings.get(winner.id)! + delta);
    ratings.set(loser.id, Math.max(0, ratings.get(loser.id)! - delta));
  }

  const sorted = teams
    .filter((t) => t.isFbs)
    .map((team) => ({
      team,
      score: ratings.get(team.id)!,
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
    score: Math.round(row.score * 10) / 10,
  }));
}
