import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- a 0-100 power score, starting every FBS team at a
 * neutral midpoint (50) and earned entirely from this season's results.
 * Nothing about preseason polls is baked in. A team's INTERNAL rating
 * (unbounded, used for all the math below) is earned from:
 *  - Wins and losses (the core Elo-style update).
 *  - Strength of the specific opponent -- their own current rating feeds
 *    the expected-score calc, so beating a good team is worth more than
 *    beating a bad one, and this propagates transitively (an opponent's
 *    rating already reflects who THEY'VE played).
 *  - Strength of their conference as a whole -- a real, fixed tier
 *    multiplier (see CONFERENCE_TIER) scales how much a WIN is worth
 *    based on the OPPONENT's conference. The Power Four (ACC, Big Ten,
 *    Big 12, SEC) sit well above everyone else: their schedules are
 *    genuinely harder top to bottom. Fixed rather than derived from each
 *    conference's own evolving average, because a conference that plays
 *    mostly itself is a closed loop -- its average stays near where it
 *    started even as one team inside it wins out over its own (equally
 *    inflated) peers, so that average never actually reflects how much
 *    weaker the conference really is.
 *  - Margin of victory -- beating a good team badly counts for more than
 *    barely getting past them, but the bonus shrinks the more one-sided
 *    the game was *expected* to be, so running up the score against an
 *    obviously overmatched opponent doesn't inflate a rating the way
 *    walloping a genuinely comparable team does.
 *  - Losing costs a real, GUARANTEED minimum amount (LOSS_FLAT_PENALTY) on
 *    top of an opponent-quality-scaled variable amount -- not just a
 *    multiplier on a variable base. A close loss to a good team still has
 *    a small variable component (correctly, that's the most forgivable
 *    kind of loss there is), but earlier versions let that small variable
 *    number combined with a multiplier stay too small in absolute terms,
 *    so several losses to good teams didn't add up to as much as they
 *    should have. The flat floor guarantees every extra loss costs a
 *    real, predictable amount regardless of who it was against, which is
 *    what actually keeps win-loss record the dominant signal without
 *    needing a separate rule bolted onto the sort order.
 *
 * The internal rating is then squashed through tanh into the displayed
 * 0-100 score (50 = average, approaching 100 for a truly exceptional
 * season, approaching 0 for a truly disastrous one). tanh is strictly
 * increasing, so the displayed score and the sort order can never
 * disagree -- unlike an earlier version of this file that added a
 * separate "record beats rating" sort rule on top of the raw number,
 * which fixed a couple of specific cases but made the displayed rating
 * meaningless (a team could show a HIGHER number while being ranked
 * BELOW a team with a lower one) and broke the conference-tier discount
 * for Group of Six teams in the process. Baking record-dominance directly
 * into the rating itself avoids both problems.
 *
 * Head-to-head is the one remaining tiebreak applied after sorting: when
 * two teams end up close (with a comparable-or-better record), the actual
 * result between them settles who ranks above whom. Elo alone can produce
 * an intransitive result (Team A beats Team B, but B's other games happen
 * to edge it slightly ahead anyway); no real committee would rank B above
 * a team that just beat them while sitting this close. Checked across
 * every nearby pair, not just adjacent ones -- a third team landing
 * almost exactly between two otherwise-close rivals would otherwise hide
 * the violation entirely. Guarded against real 3-way cycles (A beat B, B
 * beat C, C beat A -- these happen and have no consistent resolution):
 * the promoted team must not have more losses than the team it's passing.
 *
 * Conference Championship games are a special case: a single game
 * shouldn't reshuffle a whole season's picture, and it never touches any
 * team that didn't play that week. A win there is only a small flat
 * bonus; a loss barely costs anything unless it was a real blowout
 * (15+ points).
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

// Real-world relative conference strength, used to scale how much a WIN
// is worth based on the OPPONENT's conference. Ranked weakest to
// strongest (1 = strongest): 10 MAC, 9 CUSA, 8 Sun Belt, 7 Mountain West,
// 6 American, 5 Pac 12, 4 ACC, 3 Big 12, 1 (tied) SEC/Big Ten -- but with
// TWO deliberate gaps, not one: a big gap between the Group of Six tier
// and the Power Four, and a further, equally real gap between the SEC/Big
// Ten (the clear top) and the ACC/Big 12 (a notch below them, not tied
// with them). Independent isn't part of that explicit ranking; kept
// between the two Power tiers.
const CONFERENCE_TIER: Record<string, number> = {
  "Big Ten": 1.6,
  SEC: 1.6,
  Independent: 1.15,
  "Big 12": 1.05,
  ACC: 1.0,
  "Pac 12": 0.55,
  American: 0.5,
  "Mountain West": 0.45,
  "Sun Belt": 0.4,
  CUSA: 0.35,
  MAC: 0.3,
};
const DEFAULT_TIER = 0.4;
const FCS_TIER = 0.2;

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

// A guaranteed minimum cost for ANY loss, before the variable component
// below. This is what makes an extra loss reliably drop a team below
// same-conference peers with a better record, regardless of how good the
// team that beat them was -- a multiplier on a variable base alone let a
// string of *close* losses to good teams (small variable base each time)
// stay too cheap in aggregate.
const LOSS_FLAT_PENALTY = 150;

// The variable, opponent-quality-scaled component on top of the flat
// floor -- an upset loss to a clearly weaker team still costs extra here.
const LOSS_VARIABLE_MULTIPLIER = 1.6;

/**
 * How much losing to this particular opponent's conference tier softens
 * (or hardens) the variable component -- a narrow range, not a straight
 * division by tier. Losing to an elite Power team is only slightly more
 * forgivable than losing to an average one; losing to a clearly weaker
 * conference costs noticeably more.
 */
function lossToughness(winnerTier: number): number {
  return 1.3 - 0.3 * winnerTier;
}

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

// Conference Championship week is one game deciding a conference title --
// it shouldn't reshuffle a team's whole-season picture the way a regular
// game does, and it should never touch a team that didn't play that week.
// A win is worth a small flat bonus; a loss barely costs anything unless
// it was a real blowout, which costs more (but still far less than a
// typical regular-season upset would).
const CONFERENCE_CHAMPIONSHIP_WIN_BONUS = 8;
const CONFERENCE_CHAMPIONSHIP_CLOSE_LOSS_PENALTY = 3;
const CONFERENCE_CHAMPIONSHIP_BLOWOUT_LOSS_PENALTY = 20;
const BLOWOUT_MARGIN = 15;

// If two teams are within this many points of each other ON THE DISPLAYED
// 0-100 SCALE, a head-to-head result between them settles the order --
// roughly "close enough to be a real debate." Deliberately checked on the
// final display score rather than the unbounded internal rating: the
// internal scale shifts whenever the underlying formula's constants are
// retuned (it did exactly that when the loss penalty was reworked), which
// would silently miscalibrate a threshold expressed in internal-rating
// terms; the 0-100 scale is stable by definition.
const HEAD_TO_HEAD_THRESHOLD = 15;

/**
 * Checks every pair within range, not just adjacent ones -- a third team
 * sitting between two otherwise-close rivals would otherwise hide the
 * violation from an adjacent-only scan entirely, since the two ends would
 * never actually be compared to each other. Guarded against real 3-way
 * cycles: the promoted team must not have more losses than the team it's
 * passing, so a cycle can't let the worst-recorded team of the three
 * ping-pong upward by exploiting whichever single win it happens to hold.
 */
function applyHeadToHeadTiebreak<
  T extends { team: Team; score: number; losses: number },
>(sorted: T[], headToHead: Map<string, number>): T[] {
  const result = [...sorted];
  const pairKey = (aId: number, bId: number) =>
    aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`;

  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    outer: for (let i = 0; i < result.length; i++) {
      const higher = result[i];
      for (let j = i + 1; j < result.length; j++) {
        const lower = result[j];
        if (higher.score - lower.score > HEAD_TO_HEAD_THRESHOLD) continue;
        if (lower.losses > higher.losses) continue;
        const winnerId = headToHead.get(pairKey(higher.team.id, lower.team.id));
        if (winnerId === lower.team.id) {
          // `lower` actually beat `higher` head-to-head, has an equal-or-
          // better record, and they're close (even with other teams
          // between them) -- pull it up to sit directly above `higher`,
          // nudging its displayed score just past `higher`'s so the
          // number shown doesn't visually contradict the new order.
          const [promotedRaw] = result.splice(j, 1);
          const promoted = {
            ...promotedRaw,
            score: Math.round(Math.max(promotedRaw.score, higher.score + 0.1) * 10) / 10,
          } as T;
          result.splice(i, 0, promoted);
          changed = true;
          break outer; // indices shifted -- restart the scan from the top
        }
      }
    }
    if (!changed) break;
  }

  // A promoted team's nudged score is only guaranteed to beat the ONE team
  // it swapped past -- with several swaps interacting, a tiny residual
  // inconsistency further down the list is possible (and floating point
  // itself can produce one, e.g. 7.8 + 0.1 rendering as 7.8999999999999995
  // instead of 7.9). Enforce the invariant outright: the displayed score
  // must never increase as rank gets worse, full stop.
  for (let i = 1; i < result.length; i++) {
    if (result[i].score > result[i - 1].score) {
      result[i] = { ...result[i], score: result[i - 1].score };
    }
  }
  return result;
}

// Squashes the unbounded internal rating into a 0-100 display score --
// 50 is average, and it asymptotically approaches 100 (an all-time great
// season) or 0 (a truly disastrous one) without ever quite reaching
// either. tanh is strictly increasing, so this can never change the sort
// order relative to the internal rating -- the number shown always means
// what the rank shows.
const DISPLAY_SCALE = 260;

function toDisplayScore(rating: number): number {
  return Math.round((50 + 50 * Math.tanh(rating / DISPLAY_SCALE)) * 10) / 10;
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

  // "aId_bId" (lower id first) -> winner's team id for their most recent
  // meeting -- games are processed in week order, so later meetings simply
  // overwrite earlier ones.
  const headToHead = new Map<string, number>();

  for (const game of decided) {
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    const winner = team1Won ? team1 : team2;
    const loser = team1Won ? team2 : team1;
    wins.set(winner.id, (wins.get(winner.id) ?? 0) + 1);
    losses.set(loser.id, (losses.get(loser.id) ?? 0) + 1);
    headToHead.set(
      winner.id < loser.id ? `${winner.id}_${loser.id}` : `${loser.id}_${winner.id}`,
      winner.id,
    );

    const winnerRating = ratings.get(winner.id)!;
    const loserRating = ratings.get(loser.id)!;
    const margin = Math.abs(
      game.predictedScoreTeam1 - game.predictedScoreTeam2,
    );

    let winnerDelta: number;
    let loserDelta: number;

    if (game.isConferenceChampionship) {
      // One game shouldn't reshuffle a whole season's picture -- a slight
      // boost for winning, and a loss barely matters unless it was a real
      // blowout (15+ points), in which case it costs more.
      winnerDelta = CONFERENCE_CHAMPIONSHIP_WIN_BONUS;
      loserDelta =
        margin >= BLOWOUT_MARGIN
          ? CONFERENCE_CHAMPIONSHIP_BLOWOUT_LOSS_PENALTY
          : CONFERENCE_CHAMPIONSHIP_CLOSE_LOSS_PENALTY;
    } else {
      const expectedWinner = expectedScore(winnerRating, loserRating);
      const mov = marginMultiplier(margin, winnerRating, loserRating);
      const baseDelta = K_FACTOR * (1 - expectedWinner) * mov;

      const winnerWonOnRoad =
        !game.isNeutralSite &&
        (team1Won ? game.team1IsHome === false : game.team1IsHome === true);

      // Beating a Power conference team: full (or amplified) credit.
      // Beating a Group of Six team: scaled down, no matter how gaudy the
      // win total -- unless the margin was big enough to earn its own
      // credit above.
      winnerDelta =
        (baseDelta + (winnerWonOnRoad ? ROAD_WIN_BONUS : 0)) *
        conferenceTier(loser);
      // A guaranteed floor, plus a variable component for how bad the
      // upset was -- see LOSS_FLAT_PENALTY above for why the floor exists.
      loserDelta =
        LOSS_FLAT_PENALTY +
        baseDelta * LOSS_VARIABLE_MULTIPLIER * lossToughness(conferenceTier(winner));
    }

    ratings.set(winner.id, winnerRating + winnerDelta);
    ratings.set(loser.id, loserRating - loserDelta);
  }

  const byScore = teams
    .filter((t) => t.isFbs)
    .map((team) => ({
      team,
      score: toDisplayScore(ratings.get(team.id)!),
      wins: wins.get(team.id) ?? 0,
      losses: losses.get(team.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.team.name.localeCompare(b.team.name);
    });

  const sorted = applyHeadToHeadTiebreak(byScore, headToHead);

  return sorted.map((row, i) => ({
    rank: i + 1,
    teamId: row.team.id,
    team: row.team.name,
    conference: row.team.conference,
    wins: row.wins,
    losses: row.losses,
    score: row.score,
  }));
}
