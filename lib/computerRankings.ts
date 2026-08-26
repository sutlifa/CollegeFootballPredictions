import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- pure Elo, starting every FBS team at a neutral 0.
 * Nothing about preseason polls is baked into the starting point -- ratings
 * are earned entirely from this season's results. Three things move a
 * team's rating:
 *  - Wins and losses (the core Elo update).
 *  - Strength of the specific opponent -- their own current rating feeds
 *    the expected-score calc, so beating a good team is worth more than
 *    beating a bad one, and this propagates transitively (an opponent's
 *    rating already reflects who THEY'VE played).
 *  - Strength of their conference as a whole -- a real, fixed tier
 *    multiplier (see CONFERENCE_TIER) scales how much a win or loss is
 *    worth based on the OPPONENT's conference. This intentionally isn't
 *    derived from each conference's own evolving average rating: a
 *    conference that plays mostly itself is a closed loop (its average
 *    rating stays near where it started even as one team inside it wins
 *    out over its own peers), so a team can still rack up a gaudy record
 *    and an inflated individual rating purely from beating a string of
 *    weaker in-conference opponents without that conference's average ever
 *    reflecting how much weaker it really is. A fixed, real-world-informed
 *    tier avoids that -- it isn't a preseason-style head start (nothing
 *    about starting position changes), it only scales the credit actually
 *    earned from an actual result.
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

// Real-world relative conference strength, used to scale how much credit a
// win/loss is worth based on the OPPONENT's conference -- beating a Power
// conference team earns full (or better) credit; beating a Group of Six
// team earns less, no matter how gaudy the win total. Centered on 1.0.
const CONFERENCE_TIER: Record<string, number> = {
  "Big Ten": 1.15,
  SEC: 1.15,
  ACC: 1.05,
  "Big 12": 1.05,
  Independent: 1.0,
  American: 0.85,
  "Pac 12": 0.8,
  "Mountain West": 0.8,
  "Sun Belt": 0.75,
  MAC: 0.7,
  CUSA: 0.7,
};
const DEFAULT_TIER = 0.85;
const FCS_TIER = 0.4;

function conferenceTier(team: Team): number {
  if (!team.isFbs) return FCS_TIER;
  return CONFERENCE_TIER[team.conference] ?? DEFAULT_TIER;
}

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

    const expectedWinner = expectedScore(winnerRating, loserRating);
    const baseDelta = K_FACTOR * (1 - expectedWinner);

    const winnerWonOnRoad =
      !game.isNeutralSite &&
      (team1Won ? game.team1IsHome === false : game.team1IsHome === true);

    // Beating a Power conference team: full (or amplified) credit. Beating
    // a Group of Six team: scaled down, regardless of how good that
    // specific opponent's own individual record looks.
    const winnerDelta =
      (baseDelta + (winnerWonOnRoad ? ROAD_WIN_BONUS : 0)) *
      conferenceTier(loser);
    // Losing to a weak-conference team costs more (a "bad loss"); losing
    // to a strong-conference team costs a bit less (more forgivable).
    const loserDelta =
      (baseDelta * LOSS_PENALTY_MULTIPLIER) / conferenceTier(winner);

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
