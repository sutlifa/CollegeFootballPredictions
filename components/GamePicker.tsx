"use client";

import { useRef, useState, useTransition } from "react";
import { TeamLogo } from "./TeamLogo";
import { bucketForMargin, MARGIN_BUCKETS, type MarginBucketId } from "@/lib/margin";

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
  /** True once this week has kicked off -- picks are frozen for the week. */
  locked: boolean;
  /** Real result, once it exists. Both null until the game is played. */
  actualScoreTeam1: number | null;
  actualScoreTeam2: number | null;
  saveAction: (formData: FormData) => void;
  clearAction: (formData: FormData) => void;
};

/**
 * One game, ONE click. Each team owns a row of margin buttons, so tapping
 * "8-14" beside Oregon says "Oregon by 8-14" in a single action -- there's
 * no separate winner control that could get out of sync with the margin.
 *
 * On phones the two teams stack, each above its own row of four buttons.
 * From `sm` up it opens out into a tree -- margins, team, VS, team, margins
 * -- with the smallest margin nearest each team, so the scale reads outward
 * from the middle.
 *
 * Once the real result is in, the row turns into a scorebug: final score
 * beside each team, the pick marked correct (green) or wrong (red), and the
 * buttons locked so a pick can't be edited after the fact.
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
  locked,
  actualScoreTeam1,
  actualScoreTeam2,
  saveAction,
  clearAction,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(initialWinnerTeamId);
  const [marginBucket, setMarginBucket] = useState<MarginBucketId | null>(initialMarginBucket);
  const [isPending, startTransition] = useTransition();

  const complete = winnerTeamId !== null && marginBucket !== null;

  const isFinal =
    actualScoreTeam1 !== null &&
    actualScoreTeam2 !== null &&
    actualScoreTeam1 !== actualScoreTeam2;
  const actualWinnerTeamId = isFinal
    ? actualScoreTeam1! > actualScoreTeam2!
      ? team1.id
      : team2.id
    : null;
  const actualBucket = isFinal
    ? bucketForMargin(actualScoreTeam1! - actualScoreTeam2!)
    : null;
  const winnerCorrect = isFinal && winnerTeamId !== null && winnerTeamId === actualWinnerTeamId;
  const marginCorrect = winnerCorrect && marginBucket === actualBucket;
  const scoreFor = (team: TeamInfo) =>
    team.id === team1.id ? actualScoreTeam1 : actualScoreTeam2;

  const frozen = locked || isFinal;

  function pick(teamId: number, bucket: MarginBucketId) {
    if (frozen) return;
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
        const picked = winnerTeamId === team.id && marginBucket === bucket.id;
        // What actually happened, so a wrong pick still shows the answer.
        const wasActual =
          isFinal && actualWinnerTeamId === team.id && actualBucket === bucket.id;

        let tone =
          "border-line-strong bg-field text-ink-soft hover:border-accent/60 hover:text-ink";
        if (picked && isFinal) {
          tone = winnerCorrect
            ? "border-win bg-win/20 text-win"
            : "border-loss bg-loss/20 text-loss";
        } else if (picked) {
          tone = "border-accent bg-accent/15 text-accent-strong";
        } else if (wasActual) {
          tone = "border-win/60 border-dashed bg-transparent text-win";
        } else if (isFinal) {
          tone = "border-line bg-transparent text-ink-muted";
        }

        return (
          <button
            key={bucket.id}
            type="button"
            onClick={() => pick(team.id, bucket.id)}
            disabled={frozen}
            aria-pressed={picked}
            title={
              isFinal
                ? `${team.displayName} by ${bucket.label}${wasActual ? " -- what actually happened" : ""}`
                : `${team.displayName} wins by ${bucket.label} (${bucket.name})`
            }
            className={`flex-1 rounded-md border px-2 py-3 text-center text-xs font-semibold transition-colors sm:py-2.5 ${
              frozen ? "cursor-default" : "cursor-pointer"
            } ${tone}`}
          >
            {bucket.label}
          </button>
        );
      })}
    </div>
  );

  const teamLabel = (team: TeamInfo, align: "left" | "right") => {
    const isPicked = winnerTeamId === team.id;
    const won = isFinal && actualWinnerTeamId === team.id;
    const score = scoreFor(team);
    return (
      <span
        className={`flex min-w-0 items-center gap-2 text-sm ${
          align === "right" ? "sm:flex-row-reverse sm:text-right" : ""
        } ${
          isFinal
            ? won
              ? "font-semibold text-ink"
              : "font-medium text-ink-muted"
            : isPicked
              ? "font-medium text-accent-strong"
              : "font-medium text-ink"
        }`}
      >
        <TeamLogo logoUrl={team.logoUrl} name={team.displayName} size={20} />
        <span className="truncate">{team.displayName}</span>
        {isFinal && (
          <span
            className={`ml-auto shrink-0 font-mono text-base tabular-nums sm:ml-0 ${
              won ? "font-bold text-ink" : "text-ink-muted"
            }`}
          >
            {score}
          </span>
        )}
      </span>
    );
  };

  return (
    <form
      ref={formRef}
      action={saveAction}
      className={`rounded-lg border bg-surface px-3 py-3 transition-opacity ${
        isPending ? "opacity-60" : ""
      } ${
        isFinal && winnerTeamId !== null
          ? winnerCorrect
            ? "border-win/40"
            : "border-loss/40"
          : "border-line"
      }`}
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="winnerTeamId" value={winnerTeamId ?? ""} />
      <input type="hidden" name="marginBucket" value={marginBucket ?? ""} />

      <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
        {isFinal ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-soft">
            FINAL
          </span>
        ) : (
          <span>{kickoffLabel}</span>
        )}
        {isNeutral && (
          <span
            title="Neutral site -- no home-field advantage in the rankings math"
            className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site"
          >
            N
          </span>
        )}

        {isFinal && winnerTeamId !== null && (
          <span
            className={`ml-auto text-[11px] font-semibold ${
              winnerCorrect ? "text-win" : "text-loss"
            }`}
          >
            {winnerCorrect
              ? marginCorrect
                ? "Winner + margin"
                : "Winner"
              : "Missed"}
          </span>
        )}
        {isFinal && winnerTeamId === null && (
          <span className="ml-auto text-[11px] text-ink-muted">No pick</span>
        )}

        {!frozen && complete && (
          <>
            <span className="ml-auto text-[11px] font-medium text-win">Saved</span>
            <button
              type="submit"
              formAction={clearAction}
              formNoValidate
              // Reset the visible selection too, not just the stored row --
              // without this the buttons stayed highlighted after clearing,
              // so it looked like nothing happened.
              onClick={() => {
                setWinnerTeamId(null);
                setMarginBucket(null);
              }}
              // Roomier on touch screens: at py-0.5 this was a ~21px-tall
              // target, well under the ~44px a finger reliably hits, and it
              // sits inches from the margin buttons it is meant to undo.
              className="rounded border border-line-strong px-3 py-1.5 text-[11px] text-ink-soft hover:border-accent hover:text-accent-strong sm:px-2 sm:py-0.5"
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
          <div className="sm:order-last sm:w-40 sm:shrink-0 sm:text-right">
            {teamLabel(team1, "right")}
          </div>
          {marginRow(team1, "left")}
        </div>

        <span className="hidden shrink-0 text-[10px] font-bold tracking-wide text-ink-muted sm:block">
          {isFinal ? "—" : "VS"}
        </span>

        <div className="flex flex-col gap-1.5 sm:flex-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="order-first sm:w-40 sm:shrink-0">
            {teamLabel(team2, "left")}
          </div>
          {marginRow(team2, "right")}
        </div>
      </div>
    </form>
  );
}
