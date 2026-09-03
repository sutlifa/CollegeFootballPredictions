"use client";

import { useState } from "react";

export type CompareUser = { userId: number; displayName: string };

type Props = {
  users: CompareUser[];
  selected: number[];
  week: number;
  you: number;
  max: number;
};

/**
 * Who appears in the comparison, capped.
 *
 * The cap is a layout constraint, not a preference: past five columns the
 * table stops fitting and falls back to a horizontal scrollbar which, on a
 * page with ninety rows, sits at the very bottom where nobody will find it.
 * Better to make the choice impossible than to let someone build an
 * unreadable table and then have to discover why.
 *
 * Once the cap is reached every unchecked box disables itself, the same
 * pattern BracketFieldSelector uses for the 12-team field. Unchecking one
 * re-enables the rest. The server slices to the cap as well, so a
 * hand-edited URL cannot get round it.
 */
export function ComparePeoplePicker({ users, selected, week, you, max }: Props) {
  const [checked, setChecked] = useState<number[]>(selected);
  const atCap = checked.length >= max;

  function toggle(id: number) {
    setChecked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < max
          ? [...prev, id]
          : prev,
    );
  }

  return (
    <form
      method="get"
      className="rounded-lg border border-line bg-surface p-3"
    >
      <input type="hidden" name="week" value={week} />
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Show these people
        </span>
        <span className="text-xs text-ink-muted">
          {checked.length} of {max}
          {atCap && (
            <span className="text-ink-soft"> &middot; uncheck one to swap</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {users.map((u) => {
          const isChecked = checked.includes(u.userId);
          const disabled = !isChecked && atCap;
          return (
            <label
              key={u.userId}
              className={`flex items-center gap-1.5 text-sm ${
                disabled ? "cursor-not-allowed text-ink-muted" : "text-ink"
              }`}
              title={
                disabled ? `Showing the most this table fits (${max})` : undefined
              }
            >
              <input
                type="checkbox"
                name="who"
                value={u.userId}
                checked={isChecked}
                disabled={disabled}
                onChange={() => toggle(u.userId)}
                className="h-4 w-4"
              />
              {u.displayName}
              {u.userId === you && (
                <span className="text-xs text-ink-muted">(you)</span>
              )}
            </label>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={checked.length === 0}
        className="mt-3 rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-40"
      >
        Update
      </button>
    </form>
  );
}
