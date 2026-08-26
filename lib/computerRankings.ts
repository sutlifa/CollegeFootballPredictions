import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- pure Elo, starting every FBS team at a neutral 0.
 * Nothing about preseason polls is baked into the starting point -- ratings
 * are earned entirely from this season's results. Four things move a
 * team's rating:
 *  - Wins and losses (the core Elo update).
 *  - Strength of the specific opponent -- their own current rating feeds
 *    the expected-score calc, so beating a good team is worth more than
 *    beating a bad one, and this propagates transitively (an opponent's
 *    rating already reflects who THEY'VE played).
 *  - Strength of their conference as a whole -- a real, fixed tier
 *    multiplier (see CONFERENCE_TIER) scales how much a win or loss is
 *    worth based on the OPPONENT's conference. The Power Four (ACC, Big
 *    Ten, Big 12, SEC) are deliberately weighted well above everyone else:
 *    their schedules are genuinely harder top to bottom, so a Power team
 *    with a couple of losses should still usually outrank a Group of Six
 *    team with a better record, UNLESS that Group of Six team has actually
 *    proven itself -- by beating a Power team, by running the table, or by
 *    blowing teams out (see margin of victory below). This is a fixed,
 *    real-world-informed tier, not a preseason-style head start -- nothing
 *    about starting position changes, it only scales credit actually
 *    earned from a real result. It's fixed rather than derived from each
 *    conference's own evolving average specifically because a conference
 *    that plays mostly itself is a closed loop: its average rating stays
 *    near where it started even as one team inside it wins out over its
 *    own (equally inflated) peers, so that average never actually reflects
 *    how much weaker the conference really is.
 *  - Margin of victory -- beating a good team badly counts for more than
 *    barely getting past them, but the bonus shrinks the more one-sided
 *    the game was *expected* to be, so running up the score against an
 *    obviously overmatched opponent doesn't inflate a rating the way
 *    walloping a genuinely comparable team does.
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
// win/loss is worth based on the OPPONENT's conference. Ranked weakest to
// strongest (1 = strongest): 10 MAC, 9 CUSA, 8 Sun Belt, 7 Mountain West,
// 6 American, 5 Pac 12, 4 ACC, 3 Big 12, 1 (tied) SEC/Big Ten -- with a
// deliberate gap between the Power Four (SEC/Big Ten/Big 12/ACC) and
// everyone else, since a Power team's schedule is genuinely harder top to
// bottom. Independent isn't part of that explicit ranking; kept at a
// neutral 1.0 between the Power Four and the Group of Six tier.
const CONFERENCE_TIER: Record<string, number> = {
  "Big Ten": 1.35,
  SEC: 1.35,
  "Big 12": 1.2,
  ACC: 1.1,
  Independent: 1.0,
  "Pac 12": 0.75,
  American: 0.7,
  "Mountain West": 0.62,
  "Sun Belt": 0.55,
  CUSA: 0.5,
  MAC: 0.45,
};
const DEFAULT_TIER = 0.6;
const FCS_TIER = 0.3;

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
// than a plain zero-sum swap credits it for.
const LOSS_PENALTY_MULTIPLIER = 1.5;

// A 14-point margin between two evenly-matched teams is treated as the
// baseline "decisive win" -- exactly at that margin the multiplier is 1
// (no adjustment). Bigger blowouts push it above 1; narrow escapes pull it
// below 1. ln(15) normalizes that baseline.
const BASELINE_MARGIN_NORMALIZER = Math.log(15);

/**
 * Classic margin-of-victory dampener (the same shape FiveThirtyEight uses
 * for NFL Elo): scales with ln(margin), but divided by how big a margin
 * was already *expected* given the pre-game rating gap. A heavy favorite
 * blowing out a team it was supposed to blow out gets very little extra
 * credit (the denominator grows with the rating gap); a team blowing out a
 * genuinely comparable opponent (small rating gap) gets the full bonus.
 */
function marginMultiplier(margin: number, winnerRating: number, loserRating: number): number {
  const ratingGap = winnerRating - loserRating; // can be negative -- an upset amplifies the bonus further
  const raw = Math.log(Math.max(1, Math.abs(margin)) + 1) * (2.2 / (0.001 * ratingGap + 2.2));
  return raw / BASELINE_MARGIN_NORMALIZER;
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
    const margin = Math.abs(
      game.predictedScoreTeam1 - game.predictedScoreTeam2,
    );
    const mov = marginMultiplier(margin, winnerRating, loserRating);
    const baseDelta = K_FACTOR * (1 - expectedWinner) * mov;

    const winnerWonOnRoad =
      !game.isNeutralSite &&
      (team1Won ? game.team1IsHome === false : game.team1IsHome === true);

    // Beating a Power conference team: full (or amplified) credit. Beating
    // a Group of Six team: scaled down, no matter how gaudy the win total
    // -- unless the margin was big enough to earn its own credit above.
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
