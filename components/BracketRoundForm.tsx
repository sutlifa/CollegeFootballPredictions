"use client";

import { useState, type ReactNode } from "react";

type Props = {
  round: string;
  roundLabel: string;
  /** Every slot in this round, so the form knows what "finished" means. */
  slots: string[];
  /** How many already had a pick when the page rendered. */
  initialPicked: number;
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

/**
 * One round's picks, with a submit button that says what it is waiting for.
 *
 * The radios are `sr-only` so the label can be the whole hit target, and
 * they used to also be `required`. That combination silently breaks the
 * form: a required control the browser cannot focus cannot be reported on,
 * so Chrome refuses the submit and shows nothing at all. Any round with a
 * game still unpicked had a dead button -- reproduced with the original
 * markup, where the submit handler never ran and `form.checkValidity()`
 * returned false against a 1x1 input.
 *
 * That was worst exactly where people hit it: re-picking a round after
 * finishing the bracket. Saving a round clears the rounds downstream of it,
 * so editing the quarterfinals empties both semifinals -- and the
 * semifinal form then had two unpicked games and a button that did nothing.
 *
 * So `required` is gone, and the count is tracked here instead. The button
 * names the games still missing rather than failing mutely, and the server
 * action re-checks anyway: this is the explanation, not the enforcement.
 */
export function BracketRoundForm({
  round,
  roundLabel,
  slots,
  initialPicked,
  action,
  children,
}: Props) {
  const [picked, setPicked] = useState(initialPicked);

  // Recount from the DOM rather than mirroring each radio into state: the
  // inputs are uncontrolled (defaultChecked), so the form itself is the
  // truth, and one delegated handler covers every game in the round.
  const recount = (form: HTMLFormElement) => {
    let n = 0;
    for (const slot of slots) {
      if (form.querySelector(`input[name="pick_${slot}"]:checked`)) n++;
    }
    setPicked(n);
  };

  const remaining = slots.length - picked;
  const ready = remaining <= 0;
  const buttonLabel = ready
    ? `Submit ${roundLabel} Picks`
    : `Pick ${remaining} more game${remaining === 1 ? "" : "s"}`;

  const button = (
    <button
      type="submit"
      disabled={!ready}
      title={
        ready
          ? undefined
          : `Every game in this round needs a winner before it can be submitted.`
      }
      className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
    >
      {buttonLabel}
    </button>
  );

  return (
    <form
      action={action}
      onChange={(e) => recount(e.currentTarget)}
      className="space-y-4"
    >
      <input type="hidden" name="round" value={round} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">
          {roundLabel} -- pick a winner for every game
        </h2>
        {button}
      </div>
      {children}
      <div className="flex justify-end">{button}</div>
    </form>
  );
}
