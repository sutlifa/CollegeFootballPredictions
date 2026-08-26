import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- pure Elo, starting every FBS team at a neutral 0.
 * Nothing about preseason polls or conference reputation is baked into the
 * starting point -- ratings are earned entirely from this season's results.
 * Three things move a team's rating, all standard Elo mechanics rather than
 * a hardcoded point-value table:
 *  - Wins and losses (the core Elo update).
 *  - Strength of the specific opponent -- their own current rating feeds
 *    the expected-score calc, so beating a good team is worth more than
 *    beating a bad one, and this propagates transitively (an opponent's
 *    rating already reflects who THEY'VE played).
 *  - Strength of their conference as a whole -- blended into each team's
 *    effective rating for this calc only (see CONFERENCE_WEIGHT), so a
 *    team from a conference that's collectively playing well gets a little
 *    extra credit/blame beyond just their own individual record. This is
 *    recomputed fresh from every team's current rating before each game, so
 *    it evolves week to week as results come in rather than being fixed at
 *    kickoff the way a preseason conference tier would be.
 *
 * FCS/non-FBS opponents get a fixed, clearly-inferior anchor rating (not
 * ranked themselves, just a reference point) so beating one barely moves
 * the needle.
 *
 * Games are processed in week order (only weeks the caller has already
 * filtered down to "submitted" ones are included), so the rating path
 * mirrors how a real season actually unfolds rather than being computed
 * from the final win/loss tally alone.
 */

const FCS_BASELINE = -500;

// How much a team's conference-wide average rating (computed fresh from
// every member's rating so far, not a static preseason label) factors into
// their effective strength for this one calculation -- 0 would ignore
// conference entirely; 1 would judge them purely by their conference's
// average instead of their own record. 0.2 keeps the specific opponent as
// the dominant signal while still rewarding/penalizing a conference that's
// collectively strong/weak this season.
const CONFERENCE_WEIGHT = 0.2;

// Bigger than chess's usual 32: a ~13-game college season needs each result
// to move the needle more than a many-hundred-game chess rating pool would.
const K_FACTOR = 90;

// A flat bonus added to the *outcome* delta when the winner won on the
// road -- not a pre-game expected-score adjustment. Home wins and
// neutral-site wins get no adjustment at all (both "neutral"); only an
// actual road win earns a little extra credit on top of the normal delta.
const ROAD_WIN_BONUS = 10;

// Losing costs MORE than the mirror image of what the winner gained -- even
// a loss to a good team that "was supposed to happen" should sting more
// than a plain zero-sum swap credits it for. Without this, a team that
// goes 2-3 against a brutal schedule can end up barely dented, because
// each individual loss to a favored opponent only produced a small
// symmetric delta.
const LOSS_PENALTY_MULTIPLIER = 1.5;

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
    ratings.set(team.id, team.isFbs ? 0 : FCS_BASELINE);
    wins.set(team.id, 0);
    losses.set(team.id, 0);
  }

  // Recomputed from whatever the ratings map currently holds each time it's
  // called -- this is what lets conference strength evolve week to week
  // instead of being fixed at kickoff.
  function conferenceAverage(conference: string): number {
    const members = teams.filter((t) => t.isFbs && t.conference === conference);
    if (members.length === 0) return 0;
    const sum = members.reduce((s, t) => s + ratings.get(t.id)!, 0);
    return sum / members.length;
  }

  function effectiveRating(team: Team): number {
    const own = ratings.get(team.id)!;
    if (!team.isFbs) return own; // FCS: fixed anchor, no conference blend.
    return own * (1 - CONFERENCE_WEIGHT) + conferenceAverage(team.conference) * CONFERENCE_WEIGHT;
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

    const winnerRating = ratings.get(winner.id)!;
    const loserRating = ratings.get(loser.id)!;

    const expectedWinner = expectedScore(
      effectiveRating(winner),
      effectiveRating(loser),
    );
    const baseDelta = K_FACTOR * (1 - expectedWinner);

    const winnerWonOnRoad =
      !game.isNeutralSite &&
      (team1Won ? game.team1IsHome === false : game.team1IsHome === true);

    const winnerDelta = baseDelta + (winnerWonOnRoad ? ROAD_WIN_BONUS : 0);
    const loserDelta = baseDelta * LOSS_PENALTY_MULTIPLIER;

    ratings.set(winner.id, winnerRating + winnerDelta);
    ratings.set(loser.id, loserRating - loserDelta);
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
