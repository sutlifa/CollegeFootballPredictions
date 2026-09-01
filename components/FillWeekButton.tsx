"use client";

import { useState, useTransition } from "react";

type Props = {
  week: number;
  /** Games with no pick yet; the button hides itself at zero. */
  remaining: number;
  /** How many of those the preseason gap calls settled. */
  settled: number;
  fillAction: (formData: FormData) => void;
};

/**
 * Fills the games you haven't picked with the favourite.
 *
 * Confirms first, and says how many of the games it is about to decide are
 * genuinely settled versus close, because those are different offers: "fill
 * 40 games you were never going to think about" is helpful, "fill 12 games
 * that are real decisions" is doing your picking for you. It only ever adds
 * -- an existing pick is never overwritten -- and Clear week undoes it.
 */
export function FillWeekButton({ week, remaining, settled, fillAction }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (remaining === 0) return null;
  const close = remaining - settled;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-line-strong px-2.5 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent-strong"
      >
        Fill {remaining} with favorites
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-soft">
        {settled} look settled
        {close > 0 && (
          <>
            , <span className="font-semibold text-ink">{close} are close</span>
          </>
        )}
        . Fill all {remaining}?
      </span>
      <form
        action={(formData) => {
          startTransition(() => fillAction(formData));
        }}
        className="contents"
      >
        <input type="hidden" name="week" value={week} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-accent bg-accent/15 px-2.5 py-1.5 font-semibold text-accent-strong hover:bg-accent/25 disabled:opacity-50"
        >
          {isPending ? "Filling…" : "Yes, fill"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded border border-line-strong px-2.5 py-1.5 text-ink-soft hover:text-ink disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}
