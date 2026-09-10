"use client";

import { Fragment, useState, type ReactNode } from "react";

export type WeekGameItem = { id: number; node: ReactNode };

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

  // Only worth a divider when both sides of it have something in them.
  const showDivider =
    frozen.splitAfter > 0 && frozen.splitAfter < frozen.order.length;

  return (
    <div className="space-y-2">
      {ordered.map((item, i) => (
        <Fragment key={item.id}>
          {showDivider && i === frozen.splitAfter && (
            <div
              className="flex items-center gap-3 pt-4 pb-1"
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
