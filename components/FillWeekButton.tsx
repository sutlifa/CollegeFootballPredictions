"use client";

import { useState, useTransition } from "react";

type Props = {
  week: number;
  /** Games with no pick yet; the button hides itself at zero. */
  remaining: number;
  /** How many of those the rank gap calls settled. */
  settled: number;
  /** Resolves to { error } when the week refused (locked, signed out, a fault). */
  fillAction: (formData: FormData) => Promise<{ error?: string }>;
};

/**
 * Fills the games you haven't picked with the favourite.
 *
 * Confirms first, and splits the offer, because "fill 40 games you were
 * never going to think about" and "fill 12 games that are real decisions"
 * are different requests. Filling only the settled ones is the same pass
 * that runs automatically the first time a week is opened; it has to be
 * reachable here as well, because that automatic pass is spent once a week
 * has been cleared -- and without it the only way back was to have every
 * close call decided for you too, which is the exact thing the
 * settled/close split exists to prevent.
 *
 * It only ever adds -- an existing pick is never overwritten -- and Clear
 * week undoes it.
 */
export function FillWeekButton({ week, remaining, settled, fillAction }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Why the last attempt failed. Shown in the confirm row, which stays open
  // so the reason sits next to the buttons it is about; the action returns
  // it rather than throwing, because a thrown message never reaches the
  // browser in production (see WeekActionResult in the week's actions.ts).
  const [error, setError] = useState<string | null>(null);

  if (remaining === 0) return null;
  const close = remaining - settled;
  const bothKinds = settled > 0 && close > 0;

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

  const submit = (settledOnly: boolean) => (formData: FormData) => {
    formData.set("settledOnly", settledOnly ? "1" : "0");
    // Reset only once the fill and its revalidation are done, so this
    // cannot sit open over a week it has already filled.
    startTransition(async () => {
      const result = await fillAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setConfirming(false);
    });
  };

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-soft">
        {bothKinds ? (
          <>
            {settled} look settled,{" "}
            <span className="font-semibold text-ink">{close} are close</span>.
            Fill which?
          </>
        ) : close === 0 ? (
          <>All {remaining} look settled. Fill them?</>
        ) : (
          <>
            All {remaining} are{" "}
            <span className="font-semibold text-ink">close calls</span>. Fill
            anyway?
          </>
        )}
      </span>

      {/* The gentler offer goes first and stays visually quieter than the
          fill-everything one, the same way Clear week puts "just mine"
          ahead of the destructive option. */}
      {bothKinds && (
        <form action={submit(true)} className="contents">
          <input type="hidden" name="week" value={week} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded border border-line-strong px-2.5 py-1.5 font-semibold text-ink-soft hover:border-accent hover:text-accent-strong disabled:opacity-50"
          >
            Just the {settled} settled
          </button>
        </form>
      )}

      {/* When only one kind is left this is the whole offer, so it fills
          exactly what the question above described rather than always
          meaning "everything". */}
      <form action={submit(!bothKinds && close === 0)} className="contents">
        <input type="hidden" name="week" value={week} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-accent bg-accent/15 px-2.5 py-1.5 font-semibold text-accent-strong hover:bg-accent/25 disabled:opacity-50"
        >
          {isPending ? "Filling…" : bothKinds ? `All ${remaining}` : "Yes, fill"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(false);
        }}
        disabled={isPending}
        className="rounded border border-line-strong px-2.5 py-1.5 text-ink-soft hover:text-ink disabled:opacity-50"
      >
        Cancel
      </button>

      {error && (
        <span role="alert" className="basis-full font-medium text-loss">
          {error}
        </span>
      )}
    </span>
  );
}
