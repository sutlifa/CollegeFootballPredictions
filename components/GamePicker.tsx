"use client";

import { useRef, useState, useTransition } from "react";
import { TeamLogo } from "./TeamLogo";
import { MARGIN_BUCKETS, type MarginBucketId } from "@/lib/margin";

type TeamInfo = {
  id: number;
  displayName: string;
  logoUrl: string | null;
};

type Props = {
  gameId: number;
  week: number;
  kickoffLabel: string;
  isNeutral: boolean;
  /** Home team (listed first). */
  team1: TeamInfo;
  team2: TeamInfo;
  initialWinnerTeamId: number | null;
  initialMarginBucket: MarginBucketId | null;
  saveAction: (formData: FormData) => void;
  clearAction: (formData: FormData) => void;
};

/**
 * One game, ONE click. Each team has its own row of margin buttons, so
 * tapping "8-14" next to Oregon says "Oregon wins by 8-14" in a single
 * action -- picking a winner and then a margin separately was two taps and
 * allowed the nonsensical in-between state of having chosen a margin for
 * one team and a winner on the other side.
 *
 * On phones the two teams stack, each above its own row of four buttons.
 * From `sm` up it opens out into a tree: margins, team, versus, team,
 * margins -- with the smallest margin nearest each team on both sides, so
 * the scale reads outward from the middle.
 *
 * The choice is written to hidden inputs by plain <button>s rather than
 * radios: React resets a form once a server action completes, which wipes
 * the DOM state of a controlled radio whose React state didn't change in
 * that same render. Hidden inputs driven purely by state are immune.
 */
export function GamePicker({
  gameId,
  week,
  kickoffLabel,
  isNeutral,
  team1,
  team2,
  initialWinnerTeamId,
  initialMarginBucket,
  saveAction,
  clearAction,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(initialWinnerTeamId);
  const [marginBucket, setMarginBucket] = useState<MarginBucketId | null>(initialMarginBucket);
  const [isPending, startTransition] = useTransition();

  const complete = winnerTeamId !== null && marginBucket !== null;

  function pick(teamId: number, bucket: MarginBucketId) {
    setWinnerTeamId(teamId);
    setMarginBucket(bucket);
    // Let React commit the hidden inputs before the form serializes them.
    startTransition(() => {
      requestAnimationFrame(() => formRef.current?.requestSubmit());
    });
  }

  const marginRow = (team: TeamInfo, side: "left" | "right") => (
    <div
      role="group"
      aria-label={`${team.displayName} margin of victory`}
      className={`flex gap-1.5 sm:flex-1 ${
        side === "left" ? "sm:flex-row-reverse" : ""
      }`}
    >
      {MARGIN_BUCKETS.map((bucket) => {
        const selected = winnerTeamId === team.id && marginBucket === bucket.id;
        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => pick(team.id, bucket.id)}
            aria-pressed={selected}
            title={`${team.displayName} wins by ${bucket.label} (${bucket.name})`}
            className={`flex-1 cursor-pointer rounded-md border px-2 py-3 text-center text-xs font-semibold transition-colors sm:py-2.5 ${
              selected
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-line-strong bg-field text-ink-soft hover:border-accent/60 hover:text-ink"
            }`}
          >
            {bucket.label}
          </button>
        );
      })}
    </div>
  );

  const teamLabel = (team: TeamInfo, align: "left" | "right") => {
    const isWinner = winnerTeamId === team.id;
    return (
      <span
        className={`flex min-w-0 items-center gap-2 text-sm font-medium ${
          align === "right" ? "sm:flex-row-reverse sm:text-right" : ""
        } ${isWinner ? "text-accent-strong" : "text-ink"}`}
      >
        <TeamLogo logoUrl={team.logoUrl} name={team.displayName} size={20} />
        <span className="truncate">{team.displayName}</span>
      </span>
    );
  };

  return (
    <form
      ref={formRef}
      action={saveAction}
      className={`rounded-lg border border-line bg-surface px-3 py-3 transition-opacity ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="winnerTeamId" value={winnerTeamId ?? ""} />
      <input type="hidden" name="marginBucket" value={marginBucket ?? ""} />

      <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
        <span>{kickoffLabel}</span>
        {isNeutral && (
          <span
            title="Neutral site -- no home-field advantage in the rankings math"
            className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site"
          >
            N
          </span>
        )}
        {complete && (
          <>
            <span className="ml-auto text-[11px] font-medium text-win">Saved</span>
            <button
              type="submit"
              formAction={clearAction}
              formNoValidate
              className="rounded border border-line-strong px-2 py-0.5 text-[11px] text-ink-soft hover:border-accent hover:text-accent-strong"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Mobile: team above its own buttons, twice over. Desktop: the same
          pieces reflowed into margins | team | VS | team | margins. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex flex-col gap-1.5 sm:flex-1 sm:flex-row sm:items-center sm:gap-3">
          {/* sm:order-last pulls the team in beside the VS, leaving its
              margins on the outside -- the scale reads outward from the
              middle. On mobile the label just sits above its buttons. */}
          <div className="sm:order-last sm:w-36 sm:shrink-0 sm:text-right">
            {teamLabel(team1, "right")}
          </div>
          {marginRow(team1, "left")}
        </div>

        <span className="hidden shrink-0 text-[10px] font-bold tracking-wide text-ink-muted sm:block">
          VS
        </span>

        <div className="flex flex-col gap-1.5 sm:flex-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="order-first sm:w-36 sm:shrink-0">
            {teamLabel(team2, "left")}
          </div>
          {marginRow(team2, "right")}
        </div>
      </div>
    </form>
  );
}
