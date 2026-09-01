"use client";

import { useState, useTransition } from "react";

type Props = {
  week: number;
  /** Picks this person actually made. */
  chosen: number;
  /** Picks that came from "Fill with favorites" and were never looked at. */
  defaults: number;
  clearAction: (formData: FormData) => void;
};

/**
 * Wipes a week's picks, behind a confirm step.
 *
 * The confirm is not decoration: this can destroy 91 picks, and unlike
 * clearing one game there is no cheap way back -- you would be re-picking
 * the whole week by hand. A native confirm() would do the job but looks
 * like a browser error and gets dismissed by reflex, so the button becomes
 * its own question in place, naming the number at risk.
 *
 * Once a week has filled defaults in it, "clear the week" stops being one
 * question. Wiping forty formalities you never looked at is not the same
 * act as wiping the eight games you thought about, so when both exist it
 * offers both, and says which is which. The distinction only exists because
 * predictions.is_default records where a pick came from.
 *
 * Never rendered for a locked week: the server refuses those anyway, and
 * offering a control that can only fail is worse than not offering it.
 */
export function ClearWeekButton({ week, chosen, defaults, clearAction }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const total = chosen + defaults;
  if (total === 0) return null;

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

  const submit = (keepDefaults: boolean) => (formData: FormData) => {
    formData.set("keepDefaults", keepDefaults ? "1" : "0");
    startTransition(() => clearAction(formData));
  };

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-soft">
        {defaults > 0 && chosen > 0
          ? `${chosen} you picked, ${defaults} filled. Clear which?`
          : `Clear all ${total} pick${total === 1 ? "" : "s"}?`}
      </span>

      {defaults > 0 && chosen > 0 && (
        <form action={submit(true)} className="contents">
          <input type="hidden" name="week" value={week} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded border border-line-strong px-2.5 py-1.5 font-semibold text-ink-soft hover:border-accent hover:text-accent-strong disabled:opacity-50"
          >
            Just my {chosen}
          </button>
        </form>
      )}

      <form action={submit(false)} className="contents">
        <input type="hidden" name="week" value={week} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-loss bg-loss/15 px-2.5 py-1.5 font-semibold text-loss hover:bg-loss/25 disabled:opacity-50"
        >
          {isPending ? "Clearing…" : defaults > 0 && chosen > 0 ? `All ${total}` : "Yes, clear"}
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
