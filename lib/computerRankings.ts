import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * "Computer Rankings" -- pure Elo, starting every FBS team at a neutral 0.
 * Nothing about preseason polls is baked into the starting point -- ratings
 * are earned entirely from this season's results. Six things move a team's
 * rating or its final position (the first four feed the rating itself; the
 * last two only adjust final ordering):
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
 *  - Record, before rating -- fewer losses ranks a team higher, full stop,
 *    UNLESS the team with more losses has earned a rating edge bigger than
 *    a set amount per extra loss (see RATING_GAP_PER_EXTRA_LOSS). This is
 *    a hard rule, not a hope that the per-game math above happens to land
 *    that way on its own: a team can't simply out-blowout its way past a
 *    meaningfully better record without a real, sizable gap to back it
 *    up, but an exceptional one-loss team can still edge out a
 *    merely-good undefeated one if the gap is big enough.
 *  - Head-to-head, as a final tiebreak -- when two teams end up close in
 *    rating (with a record close enough that the rule above doesn't
 *    already settle it), the actual result between them (if they played)
 *    settles who ranks above whom. Elo alone can produce an intransitive
 *    result (Team A beats Team B, but B's other games happen to edge it
 *    slightly ahead anyway); no real committee would rank B above a team
 *    that just beat them while sitting this close.
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
// a loss to a good team that "was supposed to happen" should sting a lot,
// enough that an extra loss reliably drops a team below same-conference
// peers with a better record.
const LOSS_PENALTY_MULTIPLIER = 2.3;

/**
 * How much losing to this particular opponent's conference tier softens
 * (or hardens) the base loss penalty -- deliberately a NARROW range, not a
 * straight division by tier. Losing to an elite Power team is only
 * slightly more forgivable than losing to an average one; losing to a
 * clearly weaker conference costs noticeably more. A wide swing here (the
 * previous version divided the penalty by the winner's tier outright) let
 * losses to fellow Power opponents -- the single most common kind of loss
 * for a Power team -- nearly cancel the whole penalty, which is exactly
 * why multiple losses weren't dropping a team far enough.
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

// How much better a team's raw rating has to be, PER extra loss, before an
// extra loss stops deciding the order outright. A team with one more loss
// needs a genuinely large rating edge (not just "a bit better") to still
// rank above a team with a better record -- this is what actually
// guarantees "losses matter a lot" instead of hoping the per-game formula
// happens to produce that ordering on its own. Tuned so an exceptional,
// dominant one-loss team (blowout wins, a close loss to an elite
// opponent) can still edge out a merely-good undefeated team, but a
// routine extra loss (even one with otherwise-decent wins) does not.
const RATING_GAP_PER_EXTRA_LOSS = 120;

/**
 * Record comes first: fewer losses ranks higher, full stop -- UNLESS the
 * team with more losses has earned a rating edge bigger than
 * RATING_GAP_PER_EXTRA_LOSS times how many more losses it has. This is
 * deliberately a hard rule rather than a per-game formula tweak: no matter
 * how the Elo math above shakes out, a team can't simply out-blowout its
 * way past a team with a meaningfully better record without a real,
 * sizable rating gap to back it up.
 */
function compareByRecordThenRating<
  T extends { team: Team; score: number; losses: number },
>(a: T, b: T): number {
  if (a.losses !== b.losses) {
    const extraLosses = Math.abs(a.losses - b.losses);
    const requiredGap = extraLosses * RATING_GAP_PER_EXTRA_LOSS;
    const fewerLosses = a.losses < b.losses ? a : b;
    const moreLosses = a.losses < b.losses ? b : a;
    const overrides = moreLosses.score - fewerLosses.score > requiredGap;
    const winner = overrides ? moreLosses : fewerLosses;
    return winner === a ? -1 : 1;
  }
  if (b.score !== a.score) return b.score - a.score;
  return a.team.name.localeCompare(b.team.name);
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

// If two teams are within this many rating points of each other, a head-
// to-head result between them settles the order -- roughly one game's
// worth of swing, so it only kicks in when the rating gap is genuinely
// close, not when a team has clearly separated itself since.
const HEAD_TO_HEAD_THRESHOLD = 40;

/**
 * Elo alone can produce an intransitive result: Texas beats Oklahoma this
 * season, but Oklahoma's *other* games happen to leave it a few points
 * ahead of Texas anyway. A real committee would never rank Oklahoma above
 * a Texas team that just beat them while sitting close in the standings --
 * so when two teams within HEAD_TO_HEAD_THRESHOLD of each other played,
 * the actual head-to-head winner (their most recent meeting, if they
 * played more than once) is placed above, overriding the raw rating order
 * for that pair specifically.
 *
 * Checks every pair within range, not just adjacent ones -- a third team
 * sitting between two otherwise-close rivals (e.g. Texas A&M landing
 * almost exactly between Oklahoma and the Texas team that beat it) would
 * otherwise hide the violation from an adjacent-only scan entirely, since
 * Oklahoma and Texas would never actually be compared to each other.
 *
 * Guarded against real 3-way cycles (A beat B, B beat C, C beat A -- these
 * happen in real seasons and have no consistent resolution): the promoted
 * team must NOT have more losses than the team it's passing. Without that
 * guard, a cycle lets the worst-recorded team of the three ping-pong
 * upward by exploiting whichever single head-to-head win it happens to
 * hold, which is exactly backwards -- head-to-head should only settle a
 * genuine tie, never let a worse record win out over a better one.
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
          // numbers shown don't visually contradict the new order.
          const [promotedRaw] = result.splice(j, 1);
          const promoted = {
            ...promotedRaw,
            score: Math.max(promotedRaw.score, higher.score + 0.1),
          } as T;
          result.splice(i, 0, promoted);
          changed = true;
          break outer; // indices shifted -- restart the scan from the top
        }
      }
    }
    if (!changed) break;
  }
  return result;
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
      // Losing costs a lot regardless of who beat you -- only slightly
      // less against an elite opponent, only slightly more against a weak
      // one (see lossToughness).
      loserDelta =
        baseDelta * LOSS_PENALTY_MULTIPLIER * lossToughness(conferenceTier(winner));
    }

    ratings.set(winner.id, winnerRating + winnerDelta);
    ratings.set(loser.id, loserRating - loserDelta);
  }

  const byScore = teams
    .filter((t) => t.isFbs)
    .map((team) => ({
      team,
      score: ratings.get(team.id)!,
      wins: wins.get(team.id) ?? 0,
      losses: losses.get(team.id) ?? 0,
    }))
    .sort(compareByRecordThenRating);

  const sorted = applyHeadToHeadTiebreak(byScore, headToHead);

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
