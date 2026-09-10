"use client";

import { useState, useTransition } from "react";

type Props = {
  round: string;
  roundLabel: string;
  /** Picks this throws away: this round plus every round after it. */
  clears: number;
  editAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Reopens a round for re-picking, behind a confirm.
 *
 * Editing is destructive by design: it clears this round AND every round
 * after it, so the bracket is re-picked forward from here rather than
 * keeping later picks that merely happen to still be legal. Editing round 1
 * therefore throws away all eleven games.
 *
 * That is far too much to hang on one stray tap of a small "Edit" link
 * sitting beside a finished bracket, so it asks first and names the number
 * at risk -- the same bargain ClearWeekButton strikes for a week of picks.
 * The championship's own Edit clears exactly one game and says so, which is
 * the case where confirming is cheapest and the count does the explaining.
 */
export function EditRoundButton({
  round,
  roundLabel,
  clears,
  editAction,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-line-strong px-2.5 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent-strong"
      >
        Edit
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
      <span className="text-ink-soft">
        Re-pick {roundLabel}
        {clears > 1 ? (
          <>
            {" "}
            and clear{" "}
            <span className="font-semibold text-ink">{clears} picks</span> from
            here on?
          </>
        ) : (
          <> and clear this pick?</>
        )}
      </span>
      <form
        action={(formData) => {
          startTransition(async () => {
            await editAction(formData);
            setConfirming(false);
          });
        }}
        className="contents"
      >
        <input type="hidden" name="round" value={round} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-loss bg-loss/15 px-2.5 py-1 font-semibold text-loss hover:bg-loss/25 disabled:opacity-50"
        >
          {isPending ? "Clearing…" : "Yes, re-pick"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded border border-line-strong px-2.5 py-1 text-ink-soft hover:text-ink disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}
