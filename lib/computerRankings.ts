import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- a 0-100 power score, starting every FBS team at a
 * neutral midpoint (50) and earned entirely from this season's results.
 * Nothing about preseason polls is baked in.
 *
 * The internal rating is explicitly two separate, additive parts, not one
 * blended accumulator:
 *
 *   rating = recordWeight(team) * recordScore + qualityRating + confChampAdjustment
 *
 *  - recordScore is just wins minus losses (see below for the small
 *    Conference Championship exception) -- simple, transparent, and
 *    weighted heavily on purpose. This is deliberately a HARD guarantee,
 *    not a hope: a team can be down by any amount of quality/style points
 *    and it will not matter unless that gap is larger than one whole
 *    win/loss swing's worth. An earlier version tried to get "losses hurt
 *    a lot" out of a single blended Elo-style accumulator (bigger
 *    multipliers, flat penalties, conference-tier scaling all fighting
 *    each other in one number), and it kept failing in the same way: a
 *    team with a WORSE win-loss record (e.g. LSU at 11-2) could still
 *    out-rate a team with a strictly BETTER one (Georgia at 12-1, same
 *    conference) simply by having earned enough quality/style credit on
 *    its wins to outweigh the loss penalty. No amount of retuning those
 *    multipliers could guarantee that could never happen, because wins
 *    and losses were fighting inside the same multiplicative number.
 *    Splitting record out as its own dominant, additive term removes that
 *    failure mode entirely: nothing in qualityRating can ever be large
 *    enough to overcome a full win/loss difference under normal
 *    circumstances (see QUALITY_K below), and a team can only leapfrog a
 *    better record via a genuinely historic quality edge across an entire
 *    season, not from a handful of good performances.
 *
 *    recordWeight(team) itself is not flat -- it's scaled by the team's
 *    OWN conference tier, so a Power Four win/loss is worth substantially
 *    more than a Group of Six one. This is what keeps a two-loss Power
 *    team ahead of a one-loss Group of Six team by default: schedule
 *    strength suppresses the record term itself, not just the quality
 *    term, so a gaudy Group of Six record can't just out-weigh a tougher
 *    one on the strength of raw win count. Within any single conference
 *    every team shares the same weight, so record dominance there is
 *    exact and unaffected by this.
 *
 *  - qualityRating is a much smaller-scale, secondary Elo-style number:
 *    strength of the specific opponent (their own current qualityRating
 *    feeds the expected-score calc, so beating a good team is worth more
 *    than beating a bad one, and this propagates transitively), strength
 *    of their conference as a whole (a real, fixed tier multiplier scales
 *    a WIN'S credit based on the opponent's conference -- see
 *    CONFERENCE_TIER; the Power Four sit well above everyone else, and
 *    within the Power Four, SEC/Big Ten sit clearly above ACC/Big 12, not
 *    tied with them), and margin of victory (beating a good team badly
 *    counts for more than barely getting past them, but the bonus shrinks
 *    the more one-sided the game was *expected* to be). This is what lets
 *    two teams with the SAME record be told apart, and -- across a whole
 *    exceptional season -- what lets a team overcome a real (but not
 *    fabricated) record gap.
 *
 *  - Conference Championship games are a special case, kept completely
 *    separate from both terms above: a single game shouldn't reshuffle a
 *    team's whole-season picture, and it never touches any team that
 *    didn't play that week. A win there is only a small flat bonus; a
 *    loss barely costs anything unless it was a real blowout (15+
 *    points). It still counts toward the displayed win/loss record.
 *
 * The combined rating is squashed through tanh into the displayed 0-100
 * score (50 = average, approaching 100 for a truly exceptional season,
 * approaching 0 for a truly disastrous one). tanh is strictly increasing,
 * so the displayed score and the sort order can never disagree.
 *
 * Head-to-head is the one remaining tiebreak applied after sorting: when
 * two teams end up close (with a comparable-or-better record), the actual
 * result between them settles who ranks above whom. Elo alone can produce
 * an intransitive result (Team A beats Team B, but B's other games happen
 * to edge it slightly ahead anyway); no real committee would rank B above
 * a team that just beat them while sitting this close. Checked across
 * every nearby pair, not just adjacent ones. Guarded against real 3-way
 * cycles (A beat B, B beat C, C beat A): the promoted team must not have
 * more losses than the team it's passing.
 *
 * FCS/non-FBS opponents get a fixed, clearly-inferior anchor quality
 * rating (not ranked themselves, just a reference point) so beating one
 * barely moves the needle.
 *
 * Games are processed in week order (only weeks the caller has already
 * filtered down to "submitted" ones are included), so the rating path
 * mirrors how a real season actually unfolds rather than being computed
 * from the final win/loss tally alone.
 */

// How much one full win-or-loss is worth in the final rating -- large
// enough that no realistic quality-component edge overcomes it on its
// own; only a genuinely historic quality gap across a whole season (far
// more than QUALITY_K's normal per-game range) can outweigh it.
//
// WINS are scaled by the team's OWN conference tier (see CONFERENCE_TIER
// below): a Power Four win is worth much more than a Group of Six one,
// because a Power Four schedule is a fundamentally harder one to win
// against. This is what keeps a one-or-two-loss Power team ahead of a
// Group of Six team with a gaudier win total -- a 12-1 Group of Six
// season simply can't out-weigh a 10-2 Power season on the record term
// alone.
//
// LOSSES are deliberately NOT scaled by tier. A first version scaled the
// whole win-minus-loss count by the same tier multiplier, which had an
// ugly side effect: a weak conference's low tier also made ITS OWN
// losses cost less, and a strong conference's high tier made a mediocre
// team's losses cost dramatically more -- so a 3-9 Group of Six team
// could outrank a 5-7 Power team, the exact inverse of what a real
// committee would ever do. A loss is a loss regardless of conference;
// only the credit for winning should depend on how hard that was to do.
// Within a single conference every team shares the same win-tier, so a
// strictly better record (more wins, fewer-or-equal losses) still always
// wins the record term outright.
const RECORD_WEIGHT_BASE = 55;
function recordComponent(team: Team, regularWins: number, regularLosses: number): number {
  return RECORD_WEIGHT_BASE * (conferenceTier(team) * regularWins - regularLosses);
}

const FCS_QUALITY_BASELINE = -80;

// Real-world relative conference strength, used to scale how much a WIN
// is worth (in the quality component only) based on the OPPONENT's
// conference. Ranked weakest to strongest (1 = strongest): 10 MAC, 9
// CUSA, 8 Sun Belt, 7 Mountain West, 6 American, 5 Pac 12, 4 ACC, 3 Big
// 12, 1 (tied) SEC/Big Ten -- but with TWO deliberate gaps, not one: a
// big gap between the Group of Six tier and the Power Four, and a
// further, equally real gap between the SEC/Big Ten (the clear top) and
// the ACC/Big 12 (a notch below them, not tied with them). Independent
// isn't part of that explicit ranking; kept between the two Power tiers.
const CONFERENCE_TIER: Record<string, number> = {
  "Big Ten": 1.28,
  SEC: 1.28,
  Independent: 1.1,
  "Big 12": 1.06,
  ACC: 1.055,
  "Pac 12": 0.55,
  American: 0.65,
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

// Much smaller than the old single-accumulator K (90) -- this is now only
// a secondary, tie-breaking signal layered on top of RECORD_WEIGHT, not
// the primary driver of the rating.
const QUALITY_K = 12;

// Extra credit for a win over a team that was still strong at season's end,
// on top of the Elo credit already banked when the game was played. Full
// award for beating the eventual best team in the country, tapering to
// nothing at the median -- so it rewards a schedule of quality wins
// without ever penalising a team whose beaten opponent later faded.
const QUALITY_WIN_WEIGHT = 40;
const QUALITY_WIN_THRESHOLD = 0.5;

/**
 * How much of the rating everything OTHER than win-loss record is allowed
 * to move -- the quality rating, the quality-win bonus and the conference
 * championship adjustment, taken together.
 *
 * This is what actually makes "a better record always ranks higher inside
 * a conference" true rather than merely likely. The record term is scaled
 * by conference tier, so one extra win is worth `tier * 55` -- 70 in the
 * SEC but only 16.5 in the MAC -- while one extra loss is a flat 55. The
 * smallest record step a conference can produce is therefore
 * `55 * min(tier, 1)`. Bounding the combined non-record contribution to
 * ±45% of that leaves a total possible swing of 90% of one record step,
 * which cannot bridge it.
 *
 * Capping only the quality-win bonus was not enough: the Elo quality
 * rating alone can range far wider than 16.5, which is why Group of Six
 * conferences still had teams sitting above others with better records
 * (Miami (OH) 8-4 above Toledo 9-4, who never even played). Higher tiers
 * get proportionally more room, which is the intended effect -- there is
 * more genuine résumé difference to express between two 10-2 SEC teams
 * than between two 8-4 MAC teams.
 */
const NON_RECORD_HEADROOM_FRACTION = 0.2;

function nonRecordHeadroom(team: Team): number {
  return NON_RECORD_HEADROOM_FRACTION * recordStep(team);
}

/*
 * The three numbers above (headroom 0.2, champion 0.5) are chosen together
 * so two rules both hold, in every conference, by arithmetic rather than
 * by luck:
 *
 *   A conference champion always outranks a team with the SAME record that
 *   didn't win a title. Worst-case champion is -0.2 + 0.5 = +0.3 steps;
 *   best-case non-champion is +0.2. 0.3 > 0.2.
 *
 *   A better record always outranks a worse one, title or not. The largest
 *   possible non-record swing between two teams is (0.2 + 0.5) - (-0.2) =
 *   0.9 steps, and the smallest record advantage is a full 1.0 step. So an
 *   8-4 conference champion still finishes below a 10-2 or 11-1 team --
 *   winning your league breaks ties, it doesn't buy you two games.
 */

// A flat bonus added to the quality delta when the winner won on the
// road -- not a pre-game expected-score adjustment. Home wins and
// neutral-site wins get no adjustment at all (both "neutral"); only an
// actual road win earns a little extra credit on top of the normal delta.
const ROAD_WIN_BONUS = 2;

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

// How much a loss stings, scaled by the WINNER's conference tier (not the
// loser's own): losing to a stronger conference's team costs less, losing
// to a weaker conference's team costs more. 1.0 exactly at the ACC/Big 12
// tier (1.0); scales down toward ~0.7 for a loss to an SEC/Big Ten team,
// and up toward ~1.4 for a loss to a MAC-level team. This is on top of
// (not instead of) the normal expected-score/MOV shrinkage for a truly
// expected blowout loss -- this term reflects the OPPONENT'S conference
// specifically, which the quality-rating gap alone doesn't capture.
function lossToughness(winnerTier: number): number {
  return 1.55 - 0.55 * winnerTier;
}

/**
 * Conference Championship week, expressed as fractions of one record step
 * in the champion's own conference (see recordStep) rather than as flat
 * point values.
 *
 * A flat +8 was worth almost nothing in the Group of Six, where a whole
 * win is only 16.5 points and the non-record budget is smaller still, so a
 * MAC champion could finish BELOW a team with the same record that hadn't
 * even reached the title game. Scaling by conference keeps the title worth
 * the same *relative* amount everywhere.
 *
 * The win fraction is deliberately larger than the entire non-record
 * headroom below, so a champion always outranks a same-record team that
 * didn't win the title, and deliberately small enough that champion plus
 * best-case quality still can't bridge one extra win. See the invariants
 * spelled out on NON_RECORD_HEADROOM_FRACTION.
 */
const CONF_CHAMP_WIN_FRACTION = 0.5;
const CONF_CHAMP_CLOSE_LOSS_FRACTION = 0.1;
const CONF_CHAMP_BLOWOUT_LOSS_FRACTION = 0.35;
const BLOWOUT_MARGIN = 15;

/**
 * The smallest rating step a team's own conference can produce from one
 * game of record: a win is worth `tier * 55`, a loss a flat 55, so the
 * tighter of the two is `55 * min(tier, 1)`. Everything that is not record
 * is sized against this so the comparisons stay proportional between a
 * conference where a win is worth 70 and one where it's worth 16.5.
 */
function recordStep(team: Team): number {
  return RECORD_WEIGHT_BASE * Math.min(conferenceTier(team), 1);
}

// If two teams are within this many points of each other ON THE DISPLAYED
// 0-100 SCALE, a head-to-head result between them settles the order --
// roughly "close enough to be a real debate." Checked on the final
// display score rather than the internal rating, since the internal
// scale is stable-ish but the 0-100 scale is stable by definition.
const HEAD_TO_HEAD_THRESHOLD = 15;

// A much tighter threshold than HEAD_TO_HEAD_THRESHOLD, for two teams in
// the SAME conference that never played each other: within this tiny a
// gap, the quality term has essentially settled nothing meaningful, and a
// team with a strictly better record shouldn't be shown below one it
// clearly outperformed record-wise just because of a fraction-of-a-point
// quality wobble. This only applies within a single conference -- across
// conferences a "better" record is explicitly NOT a dominance guarantee
// (that's the entire point of the conference-tier system: an undefeated
// Group of Six or second-tier Power team should NOT be free to leapfrog
// a one-loss SEC/Big Ten team just because it has one fewer loss). Kept
// deliberately tiny (well under a single point) -- this is a noise
// filter for genuine rounding-level near-ties, not a license to let a
// team's spotless record override a real, intentional conference-tier
// gap.
const RECORD_NOISE_THRESHOLD = 0.6;

/**
 * Checks every pair within range, not just adjacent ones -- a third team
 * sitting between two otherwise-close rivals would otherwise hide the
 * violation from an adjacent-only scan entirely. Guarded against real
 * 3-way cycles: the promoted team must not have more losses than the team
 * it's passing.
 *
 * Two independent triggers can promote a team: (1) it beat the team above
 * it head-to-head and the gap is within HEAD_TO_HEAD_THRESHOLD, or (2) it
 * has a strictly better record and the gap is within the much tighter
 * RECORD_NOISE_THRESHOLD (for pairs that never played -- a near-tie
 * shouldn't let a sliver of quality-term noise override a clean record
 * advantage).
 *
 * Promoting a team over a distant rival shifts everyone sitting between
 * them down by one slot -- collateral damage that's only fair to a
 * bystander when it's genuinely part of the same cyclic conflict (i.e.
 * the team being passed also beat that bystander, so *something* has to
 * give no matter how the three are ordered). If a bystander has no such
 * connection -- it simply beat the team being promoted, in a game that
 * has nothing to do with this specific violation -- the promotion is
 * blocked rather than silently overriding a real, unrelated result.
 */
function applyHeadToHeadTiebreak<
  T extends { team: Team; score: number; wins: number; losses: number },
>(sorted: T[], headToHead: Map<string, number>): T[] {
  const result = [...sorted];
  const pairKey = (aId: number, bId: number) =>
    aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`;
  const beat = (winnerId: number, loserId: number) =>
    headToHead.get(pairKey(winnerId, loserId)) === winnerId;

  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    outer: for (let i = 0; i < result.length; i++) {
      const higher = result[i];
      for (let j = i + 1; j < result.length; j++) {
        const lower = result[j];
        const gap = higher.score - lower.score;
        if (lower.losses > higher.losses) continue;

        const wonHeadToHead =
          gap <= HEAD_TO_HEAD_THRESHOLD && beat(lower.team.id, higher.team.id);
        const clearlyBetterRecord =
          gap <= RECORD_NOISE_THRESHOLD &&
          lower.team.conference === higher.team.conference &&
          lower.wins >= higher.wins &&
          (lower.wins > higher.wins || lower.losses < higher.losses);
        if (!wonHeadToHead && !clearlyBetterRecord) continue;

        let blocked = false;
        for (let k = i + 1; k < j; k++) {
          const mid = result[k];
          // Never drag a team past a bystander with a strictly better
          // record. Head-to-head can justify passing the team you actually
          // beat, but not everyone sitting in between -- and when the three
          // form a genuine cycle (A beat B, B beat C, C beat A) the better
          // record is the fairer way to break it than whichever pair the
          // scan happened to reach first. Without this, beating a 9-3 team
          // let an 8-3 team leapfrog a 9-3 team that had beaten IT.
          const midHasBetterRecord =
            mid.wins >= lower.wins &&
            mid.losses <= lower.losses &&
            (mid.wins > lower.wins || mid.losses < lower.losses);
          if (midHasBetterRecord) {
            blocked = true;
            break;
          }
          if (beat(mid.team.id, lower.team.id) && !beat(higher.team.id, mid.team.id)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        const [promotedRaw] = result.splice(j, 1);
        const promoted = {
          ...promotedRaw,
          score:
            Math.round(Math.max(promotedRaw.score, higher.score + 0.001) * 1000) /
            1000,
        } as T;
        result.splice(i, 0, promoted);
        changed = true;
        break outer;
      }
    }
    if (!changed) break;
  }

  for (let i = 1; i < result.length; i++) {
    if (result[i].score > result[i - 1].score) {
      result[i] = { ...result[i], score: result[i - 1].score };
    }
  }
  return result;
}

// Squashes the unbounded internal rating into a 0-100 display score.
const DISPLAY_SCALE = 500;

function toDisplayScore(rating: number): number {
  // Three decimals: at one decimal, teams whose ratings genuinely differed
  // rounded to the same number and looked tied on screen (23 adjacent
  // same-conference pairs did). The sort already uses the exact rating, so
  // this only changes what is shown -- but it should agree with the order.
  return Math.round((50 + 50 * Math.tanh(rating / DISPLAY_SCALE)) * 1000) / 1000;
}

export function computeComputerRankings(
  teams: Team[],
  games: Game[],
): RankingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const qualityRatings = new Map<number, number>();
  const regularSeasonWins = new Map<number, number>();
  const regularSeasonLosses = new Map<number, number>();
  const confChampAdjustments = new Map<number, number>();
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  /** FBS teams each team beat, for the end-of-season quality-win bonus. */
  const beatenOpponents = new Map<number, number[]>();

  for (const team of teams) {
    qualityRatings.set(team.id, team.isFbs ? 0 : FCS_QUALITY_BASELINE);
    regularSeasonWins.set(team.id, 0);
    regularSeasonLosses.set(team.id, 0);
    confChampAdjustments.set(team.id, 0);
    wins.set(team.id, 0);
    losses.set(team.id, 0);
    beatenOpponents.set(team.id, []);
  }

  const decided = games
    .filter(isDecided)
    .filter((g) => g.predictedScoreTeam1 !== g.predictedScoreTeam2)
    .sort((a, b) => a.week - b.week || a.id - b.id);

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

    const margin = Math.abs(
      game.predictedScoreTeam1 - game.predictedScoreTeam2,
    );

    if (game.isConferenceChampionship) {
      confChampAdjustments.set(
        winner.id,
        (confChampAdjustments.get(winner.id) ?? 0) +
          CONF_CHAMP_WIN_FRACTION * recordStep(winner),
      );
      confChampAdjustments.set(
        loser.id,
        (confChampAdjustments.get(loser.id) ?? 0) -
          (margin >= BLOWOUT_MARGIN
            ? CONF_CHAMP_BLOWOUT_LOSS_FRACTION
            : CONF_CHAMP_CLOSE_LOSS_FRACTION) *
            recordStep(loser),
      );
      continue;
    }

    regularSeasonWins.set(winner.id, (regularSeasonWins.get(winner.id) ?? 0) + 1);
    regularSeasonLosses.set(loser.id, (regularSeasonLosses.get(loser.id) ?? 0) + 1);

    const winnerQuality = qualityRatings.get(winner.id)!;
    const loserQuality = qualityRatings.get(loser.id)!;

    const expectedWinner = expectedScore(winnerQuality, loserQuality);
    const mov = marginMultiplier(margin, winnerQuality, loserQuality);
    const baseDelta = QUALITY_K * (1 - expectedWinner) * mov;

    const winnerWonOnRoad =
      !game.isNeutralSite &&
      (team1Won ? game.team1IsHome === false : game.team1IsHome === true);

    const rawDelta = baseDelta + (winnerWonOnRoad ? ROAD_WIN_BONUS : 0);

    // Beating a Power conference team: full (or amplified) credit for the
    // WINNER, scaled by the LOSER's tier. Beating a Group of Six team:
    // scaled down for the winner, no matter how gaudy the win total --
    // unless the margin was big enough to earn its own credit above.
    //
    // The loser's own penalty is scaled separately, by lossToughness of
    // the WINNER's tier -- losing to a stronger conference's team costs
    // less, losing to a weaker conference's team costs more. It is NOT
    // scaled by the loser's OWN conference tier: an earlier version used
    // the same multiplier for both sides, which meant a weak conference's
    // low tier also made its own losses cost less (and a strong
    // conference's high tier made its own losses cost dramatically more)
    // -- letting bad Group of Six teams float above bad Power teams,
    // exactly backwards from how a real committee would see it.
    const winnerGain = rawDelta * conferenceTier(loser);
    const loserPenalty = rawDelta * lossToughness(conferenceTier(winner));
    qualityRatings.set(winner.id, winnerQuality + winnerGain);
    qualityRatings.set(loser.id, loserQuality - loserPenalty);

    if (loser.isFbs) {
      beatenOpponents.get(winner.id)!.push(loser.id);
    }
  }

  // ---- Quality wins, judged on where the opponent FINISHED ----------------
  //
  // The credit above is Elo-style and sequential: it uses the opponent's
  // rating at the moment you played them, and it is never taken back. Beat
  // a team while they look great and you keep every point of that even if
  // they collapse in November.
  //
  // What that alone misses is the difference between beating a team that
  // stayed good and beating one whose ranking evaporated. So each win also
  // earns a bonus scaled by how strong the opponent was AT THE END. It is
  // strictly additive and never negative -- a beaten team falling apart can
  // only fail to earn you extra, it can never cost you anything -- but a
  // season full of wins over teams that held up finishes ahead of an
  // identical record built on teams that didn't.
  const preliminary = new Map<number, number>();
  for (const team of teams) {
    if (!team.isFbs) continue;
    preliminary.set(
      team.id,
      recordComponent(
        team,
        regularSeasonWins.get(team.id) ?? 0,
        regularSeasonLosses.get(team.id) ?? 0,
      ) +
        (qualityRatings.get(team.id) ?? 0) +
        (confChampAdjustments.get(team.id) ?? 0),
    );
  }
  // Percentile of each team's finishing strength: 1 for the best team in the
  // country, 0 for the worst. Using a percentile rather than the raw rating
  // keeps this stable no matter how the rating constants are retuned.
  const finishOrder = [...preliminary.entries()].sort((a, b) => b[1] - a[1]);
  const finishPercentile = new Map<number, number>();
  finishOrder.forEach(([teamId], i) => {
    finishPercentile.set(
      teamId,
      finishOrder.length > 1 ? 1 - i / (finishOrder.length - 1) : 1,
    );
  });

  const qualityWinBonus = new Map<number, number>();
  for (const team of teams) {
    if (!team.isFbs) continue;
    let bonus = 0;
    for (const opponentId of beatenOpponents.get(team.id) ?? []) {
      const percentile = finishPercentile.get(opponentId) ?? 0;
      // Only wins over teams that finished in the top half count, ramping
      // from nothing at the median to the full award for beating the best
      // team in the country.
      bonus +=
        QUALITY_WIN_WEIGHT * Math.max(0, percentile - QUALITY_WIN_THRESHOLD);
    }
    qualityWinBonus.set(team.id, bonus);
  }

  const byScore = teams
    .filter((t) => t.isFbs)
    .map((team) => {
      // Quality is bounded to the headroom so it can't overturn a record,
      // but SQUASHED into it rather than clipped. A hard clamp destroyed
      // exactly the comparison this term exists to make: once two teams
      // both exceeded the headroom they pinned to the identical value and
      // became tied, so three SEC teams with different résumés all landed
      // on 95.2. tanh is strictly increasing, so two 10-2 teams always stay
      // ordered by the quality of their wins and losses no matter how far
      // out they are -- the gap just compresses as it approaches the bound.
      const headroom = nonRecordHeadroom(team);
      const rawNonRecord =
        (qualityRatings.get(team.id) ?? 0) + (qualityWinBonus.get(team.id) ?? 0);
      const nonRecord = headroom * Math.tanh(rawNonRecord / headroom);
      const rating =
        recordComponent(
          team,
          regularSeasonWins.get(team.id) ?? 0,
          regularSeasonLosses.get(team.id) ?? 0,
        ) +
        nonRecord +
        // Outside the clamp on purpose: a title has to beat any quality
        // difference at the same record, which it could not do from inside
        // the same budget quality is competing for.
        (confChampAdjustments.get(team.id) ?? 0);
      return {
        team,
        rating,
        score: toDisplayScore(rating),
        wins: wins.get(team.id) ?? 0,
        losses: losses.get(team.id) ?? 0,
      };
    })
    .sort((a, b) => {
      // Sort on the exact rating, not the rounded display score. Rounding to
      // one decimal collapses ratings that genuinely differ, and two 10-2
      // teams that landed on the same rounded number were then ordered
      // alphabetically -- throwing away the quality-of-wins comparison the
      // rating had already made. tanh and the rounding are both monotonic,
      // so ordering by rating never disagrees with the score shown.
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.score !== a.score) return b.score - a.score;
      // Two teams can land on the exact same rounded display score without
      // their underlying records being equal. When that happens, prefer
      // the better record over an arbitrary alphabetical tiebreak -- name
      // order has no business deciding a record-vs-record tie.
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.wins !== a.wins) return b.wins - a.wins;
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

/**
 * The rankings as they stood after each week that has games, so a team's
 * rise or fall through the season is visible rather than only its final
 * position. Each entry is a full ranking computed from every game up to
 * and including that week -- exactly what computeComputerRankings would
 * have returned at the time.
 *
 * Note the rating is path-dependent by design (Elo credit uses the
 * opponent's rating at the moment you played them), so this genuinely
 * re-runs the season week by week rather than interpolating a final
 * answer backwards.
 */
export function computeWeeklyRankings(
  teams: Team[],
  games: Game[],
): { week: number; rankings: RankingRow[] }[] {
  const weeks = [...new Set(games.filter(isDecided).map((g) => g.week))].sort(
    (a, b) => a - b,
  );
  return weeks.map((week) => ({
    week,
    rankings: computeComputerRankings(
      teams,
      games.filter((g) => g.week <= week),
    ),
  }));
}

/**
 * How far each team moved between the two most recent ranked weeks.
 * Positive means climbing (rank 12 -> 8 is +4); null when the team has no
 * previous week to compare against.
 */
export function rankMovement(
  weekly: { week: number; rankings: RankingRow[] }[],
): Map<number, number | null> {
  const movement = new Map<number, number | null>();
  if (weekly.length === 0) return movement;
  const current = weekly[weekly.length - 1].rankings;
  const previous = weekly.length > 1 ? weekly[weekly.length - 2].rankings : null;
  const previousRank = new Map(
    (previous ?? []).map((r) => [r.teamId, r.rank]),
  );
  for (const row of current) {
    const before = previousRank.get(row.teamId);
    movement.set(row.teamId, before === undefined ? null : before - row.rank);
  }
  return movement;
}
