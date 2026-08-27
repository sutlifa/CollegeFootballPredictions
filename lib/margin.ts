/**
 * Predictions are "who wins, and by roughly how much" rather than an exact
 * final score -- entering two numbers for all ~900 games is a lot to ask,
 * and the exact digits never mattered: everything downstream (Computer
 * Rankings' margin-of-victory term, conference tiebreakers, the Bracket)
 * only ever used the MARGIN between the two scores, never the raw points.
 *
 * Four buckets, from a one-score game to a rout.
 */
export type MarginBucketId = 0 | 1 | 2 | 3;

export type MarginBucket = {
  id: MarginBucketId;
  /** Shown on the pick control, e.g. "8-14". */
  label: string;
  /** Plain-language name for the tier, e.g. "Medium". */
  name: string;
  min: number;
  /** Inclusive; Infinity for the open-ended top bucket. */
  max: number;
  /**
   * The margin this bucket stands in for wherever a single number is
   * needed -- roughly the middle of the range (the open-ended top bucket
   * gets a sensible blowout figure rather than a midpoint of Infinity).
   */
  representativeMargin: number;
};

export const MARGIN_BUCKETS: readonly MarginBucket[] = [
  { id: 0, label: "1-7", name: "Close", min: 1, max: 7, representativeMargin: 4 },
  { id: 1, label: "8-14", name: "Medium", min: 8, max: 14, representativeMargin: 11 },
  { id: 2, label: "15-21", name: "Large", min: 15, max: 21, representativeMargin: 18 },
  { id: 3, label: "22+", name: "Blowout", min: 22, max: Infinity, representativeMargin: 28 },
];

export function isMarginBucketId(value: number): value is MarginBucketId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function marginBucket(id: MarginBucketId): MarginBucket {
  return MARGIN_BUCKETS[id];
}

/** Which bucket a real (or previously hand-entered) margin falls into. */
export function bucketForMargin(margin: number): MarginBucketId {
  const m = Math.abs(margin);
  if (m <= 7) return 0;
  if (m <= 14) return 1;
  if (m <= 21) return 2;
  return 3;
}

/**
 * A losing score to hang the representative margin off of, so the rest of
 * the app can keep working in terms of a (score1, score2) pair. Only the
 * DIFFERENCE carries meaning -- these are not a claim about the real final
 * score, just a stable way to express "won by about this much".
 */
export const NOMINAL_LOSING_SCORE = 21;

/** The (winner, loser) score pair standing in for a bucket. */
export function representativeScores(id: MarginBucketId): {
  winner: number;
  loser: number;
} {
  return {
    winner: NOMINAL_LOSING_SCORE + marginBucket(id).representativeMargin,
    loser: NOMINAL_LOSING_SCORE,
  };
}
