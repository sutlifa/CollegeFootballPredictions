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
 * One game's pick: tap the winner, tap how big the win is. Saves itself as
 * soon as both halves are chosen (and on every change after that), so
 * there's no Save button to hunt for -- a full week is two taps per game.
 *
 * The two choices are plain <button>s writing to hidden inputs, NOT radio
 * inputs. React resets a form after a server action completes, which wipes
 * the DOM `checked` state of a controlled radio whose React state didn't
 * happen to change during that same render -- so picking the winner and
 * then the margin submitted the margin with the winner already blanked
 * out. Hidden inputs are driven purely by state and are immune to that
 * reset.
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

  function submitIfComplete(nextWinner: number | null, nextBucket: MarginBucketId | null) {
    if (nextWinner === null || nextBucket === null) return;
    // Let React commit the hidden inputs before the form serializes them.
    startTransition(() => {
      requestAnimationFrame(() => formRef.current?.requestSubmit());
    });
  }

  function pickWinner(teamId: number) {
    setWinnerTeamId(teamId);
    submitIfComplete(teamId, marginBucket);
  }

  function pickMargin(bucket: MarginBucketId) {
    setMarginBucket(bucket);
    submitIfComplete(winnerTeamId, bucket);
  }

  const teamButton = (team: TeamInfo) => {
    const selected = winnerTeamId === team.id;
    return (
      <button
        type="button"
        onClick={() => pickWinner(team.id)}
        aria-pressed={selected}
        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          selected
            ? "border-accent bg-accent/15 text-accent-strong"
            : "border-line-strong bg-field text-ink-soft hover:border-accent/60 hover:text-ink"
        }`}
      >
        <TeamLogo logoUrl={team.logoUrl} name={team.displayName} size={20} />
        <span className="truncate">{team.displayName}</span>
      </button>
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
          <span className="ml-auto text-[11px] font-medium text-win">Saved</span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2 sm:flex-1" role="group" aria-label="Winner">
          {teamButton(team1)}
          {teamButton(team2)}
        </div>

        <div className="flex gap-1.5 sm:shrink-0" role="group" aria-label="Margin of victory">
          {MARGIN_BUCKETS.map((bucket) => {
            const selected = marginBucket === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => pickMargin(bucket.id)}
                aria-pressed={selected}
                title={`${bucket.name} -- wins by ${bucket.label} points`}
                className={`flex-1 cursor-pointer rounded-md border px-2 py-2 text-center text-xs font-semibold transition-colors sm:flex-none ${
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

        {complete && (
          <button
            type="submit"
            formAction={clearAction}
            formNoValidate
            className="self-end rounded border border-line-strong px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent-strong sm:self-auto"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
