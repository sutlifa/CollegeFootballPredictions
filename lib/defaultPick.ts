import { bucketForMargin, type MarginBucketId } from "./margin";
import type { Team } from "./types";

/**
 * The pick to fill in for a game nobody wants to think about.
 *
 * WHY THIS EXISTS. A season is ~888 games and most of them are not a
 * decision: a preseason top-10 team hosting an FCS side is not an opinion,
 * it is paperwork, and 888 of those is the reason people bounce off the
 * app. This lets someone fill the obvious ones and spend their attention on
 * the games they actually have a view about.
 *
 * WHY RANK GAP, NOT "IS IT AN IMPORTANT GAME". Measured against this pool's
 * real picks (260 games with four or more people on them), the favourite by
 * preseason rank matched the pool's majority 93% of the time, and the
 * agreement tracks the gap almost perfectly:
 *
 *   gap 70+    133 games   100% matched the majority
 *   gap 35-69   54 games    96%
 *   gap 15-34   44 games    84%
 *   gap 0-14    29 games    72%
 *
 * So the gap is a measured confidence, not a guess. "Top-50 involved" was
 * the obvious filter and is a worse one -- it is a proxy for interest,
 * while the gap is a proxy for how settled the answer is, which is the
 * thing that actually decides whether a pick is worth making.
 *
 * THE MARGIN IS A WEAKER CLAIM THAN THE WINNER. The same check put the
 * bucket below on the pool's modal bucket only 44% of the time (chance is
 * 25%). Better than nothing and defensible from the gap, but it is a
 * starting point to edit, not an answer -- which is why filling defaults is
 * something a person asks for rather than something that happens to them.
 */

/** Where a non-FBS opponent sits on the same scale as a poll rank. */
const FCS_RANK = 200;
/** An FBS team the poll didn't rank: mid-table, not terrible. */
const UNRANKED_FBS = 150;

/** Rank gaps at which the margin default steps up a bucket. */
const BLOWOUT_GAP = 70;
const LARGE_GAP = 35;
const MEDIUM_GAP = 15;

/**
 * At or above this gap the favourite matched the pool's majority ~100% of
 * the time, so the game can be described as settled rather than merely
 * likely. Used to tell someone which games are worth their attention.
 */
export const SETTLED_GAP = 35;

/**
 * Where a team sits, preferring the CURRENT Computer Rankings over the
 * preseason poll when they are available.
 *
 * This has to agree with what the page shows. The week page prints live
 * ranks beside team names, so filling from the preseason poll made the
 * suggestion contradict the number right next to it -- LSU shown at #17
 * against Texas A&M at #11, and the fill choosing LSU because the August
 * poll had them a place apart the other way. Nine games in a single week
 * disagreed. A default that argues with the screen is worse than no
 * default, because now you have to check its work.
 *
 * Non-FBS teams are never ranked, so they keep the FCS floor either way.
 */
export function rankValue(
  team: Team | undefined,
  liveRanks?: Map<number, number>,
): number {
  if (!team) return UNRANKED_FBS;
  if (!team.isFbs) return FCS_RANK;
  const live = liveRanks?.get(team.id);
  if (typeof live === "number") return live;
  return team.preseasonRank ?? UNRANKED_FBS;
}

export type DefaultPick = {
  winnerTeamId: number;
  marginBucket: MarginBucketId;
  /** Preseason rank gap; bigger means the pick is more settled. */
  gap: number;
  settled: boolean;
};

export function defaultPickFor(
  team1: Team | undefined,
  team2: Team | undefined,
  team1Id: number,
  team2Id: number,
  liveRanks?: Map<number, number>,
): DefaultPick {
  const r1 = rankValue(team1, liveRanks);
  const r2 = rankValue(team2, liveRanks);
  const gap = Math.abs(r1 - r2);
  // Ties go to team1, which is the home side everywhere in this schedule.
  const winnerTeamId = r1 <= r2 ? team1Id : team2Id;
  const marginBucket: MarginBucketId =
    gap >= BLOWOUT_GAP ? 3 : gap >= LARGE_GAP ? 2 : gap >= MEDIUM_GAP ? 1 : 0;
  return { winnerTeamId, marginBucket, gap, settled: gap >= SETTLED_GAP };
}

/** Sanity helper: the bucket a real margin would land in. Re-exported so
 *  callers comparing a default against a result use one definition. */
export { bucketForMargin };
