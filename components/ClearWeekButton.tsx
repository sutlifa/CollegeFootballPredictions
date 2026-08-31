"use client";

import { useState, useTransition } from "react";

type Props = {
  week: number;
  /** How many picks would be destroyed; the button hides itself at zero. */
  pickedCount: number;
  clearAction: (formData: FormData) => void;
};

/**
 * Wipes a whole week's picks, behind a confirm step.
 *
 * The confirm is not decoration: this can destroy 91 picks, and unlike
 * clearing one game there is no cheap way back -- you would be re-picking
 * the whole week by hand. A native confirm() dialog would do the job but
 * looks like a browser error and is easy to dismiss by reflex, so the
 * button becomes its own question in place, naming the number at risk.
 *
 * Never rendered for a locked week: the server refuses those anyway, and
 * offering a control that can only fail is worse than not offering it.
 */
export function ClearWeekButton({ week, pickedCount, clearAction }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (pickedCount === 0) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-line-strong px-2.5 py-1.5 text-xs text-ink-soft hover:border-loss hover:text-loss"
      >
        Clear week
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-soft">
        Clear all {pickedCount} pick{pickedCount === 1 ? "" : "s"}?
      </span>
      <form
        action={(formData) => {
          startTransition(() => clearAction(formData));
        }}
        className="contents"
      >
        <input type="hidden" name="week" value={week} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-loss bg-loss/15 px-2.5 py-1.5 font-semibold text-loss hover:bg-loss/25 disabled:opacity-50"
        >
          {isPending ? "Clearing…" : "Yes, clear"}
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
