"use client";

import { Fragment, useState, type ReactNode } from "react";

export type WeekGameItem = {
  id: number;
  node: ReactNode;
  /** Whether the server currently holds a pick for this game. */
  picked: boolean;
};

type Props = {
  /** Already in display order: unpicked first, then picked, each by kickoff. */
  items: WeekGameItem[];
  /** How many of the leading items were unpicked when the page loaded. */
  unpickedCount: number;
};

/**
 * Renders a week's games in the order the page ARRIVED in, and holds that
 * order still until the next real page load.
 *
 * The server puts everything still unpicked at the top, earliest kickoff
 * first, so opening a week -- or coming back to one after the settled games
 * filled themselves -- lands you on the games you actually have to decide.
 *
 * Freezing matters as much as the sort. Saving a pick calls revalidatePath
 * for this route, so the server re-renders with that game no longer
 * unpicked. Ordering straight from that render would yank the card you just
 * touched down the page and slide the next one up under your finger, on
 * every single pick. So the id order is captured once, at mount, and later
 * renders are laid out against it: the pick you make is reflected in the
 * card, never in where the card sits. Navigating to another week remounts
 * this (it is keyed by week), and a reload starts a fresh order -- which is
 * exactly the "refresh brings the stragglers back to the top" behaviour
 * this is for.
 *
 * A game that appears later and was not in the frozen order -- the schedule
 * ingest adding a fixture mid-week, a derived championship arriving -- is
 * appended rather than dropped. Nothing that exists goes unrendered.
 *
 * The ORDER stays frozen; the "Already picked" divider does not. It is a
 * claim about the cards beneath it, and a frozen claim went stale: after
 * Clear week it sat above games that had just been emptied, and after Fill
 * all it split a week in which everything was now picked. So it is
 * re-checked on every render against the server's current picks and shown
 * only while the split it was drawn for still holds -- something above it
 * is still unpicked and everything below it is picked.
 *
 * "Shown" means VISIBLE, not rendered: when the claim stops holding the
 * divider turns invisible but keeps its space. Removing it would pull every
 * card beneath it up by its height, and one of those can be the card just
 * tapped -- clearing a single pick in the bottom half is exactly what
 * breaks the split -- which is the movement under the finger this whole
 * component exists to prevent. Re-sorting after a bulk Clear/Fill was the
 * other option, passed over because it means letting a header button
 * remount a sibling list, and all for a divider.
 */
export function WeekGameList({ items, unpickedCount }: Props) {
  const [frozen] = useState(() => ({
    order: items.map((item) => item.id),
    splitAfter: unpickedCount,
  }));

  const byId = new Map(items.map((item) => [item.id, item]));
  const known = frozen.order
    .map((id) => byId.get(id))
    .filter((item): item is WeekGameItem => item !== undefined);
  const added = items.filter((item) => !frozen.order.includes(item.id));
  const ordered = [...known, ...added];

  // The divider goes before the first card of the frozen bottom half,
  // found by id rather than by index, so a game dropped from the list (a
  // week-16 matchup re-derived away) cannot shift it onto the wrong card.
  const bottomHalf = new Set(frozen.order.slice(frozen.splitAfter));
  const dividerAt = ordered.findIndex((item) => bottomHalf.has(item.id));
  // Rendered whenever both halves exist (as at mount), so it never comes
  // or goes; visible only while the split is still true.
  const hasDivider = dividerAt > 0;
  const dividerTrue =
    hasDivider &&
    ordered.slice(0, dividerAt).some((item) => !item.picked) &&
    ordered.slice(dividerAt).every((item) => item.picked);

  return (
    <div className="space-y-2">
      {ordered.map((item, i) => (
        <Fragment key={item.id}>
          {hasDivider && i === dividerAt && (
            <div
              className={`flex items-center gap-3 pt-4 pb-1 ${
                dividerTrue ? "" : "invisible"
              }`}
              aria-hidden
            >
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Already picked
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          {item.node}
        </Fragment>
      ))}
    </div>
  );
}
