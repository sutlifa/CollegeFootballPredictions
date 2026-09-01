"use client";

import { useRef, useState, useTransition } from "react";
import { TeamLogo } from "./TeamLogo";
import { bucketForMargin, MARGIN_BUCKETS, type MarginBucketId } from "@/lib/margin";

/** Ranks are only worth showing this deep; below it they are just noise. */
const RANKED_CUTOFF = 25;

type TeamInfo = {
  id: number;
  displayName: string;
  logoUrl: string | null;
  /**
   * Current computer-ranking position, or null. Only shown inside the top
   * 25 -- that is the convention everywhere football is written down, and
   * "#131" beside a name is noise rather than information.
   */
  rank?: number | null;
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
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(initialWinnerTeamId);
  const [marginBucket, setMarginBucket] = useState<MarginBucketId | null>(initialMarginBucket);
  const [isPending, startTransition] = useTransition();

  /**
   * Re-sync when the SERVER's idea of this pick changes underneath us.
   *
   * useState reads its argument once, at mount. That is fine while this
   * component is the only thing that edits its own game -- but "Fill with
   * favorites" writes picks for dozens of games at once, and those pickers
   * are already mounted. They kept rendering their mount-time null while
   * the database said otherwise: the week counted as complete, Clear week
   * appeared, and not one button looked selected.
   *
   * This is React's documented adjust-state-during-render pattern rather
   * than an effect (no extra paint) or a changing `key` on the parent
   * (which would remount every picker on every save and throw away the
   * pending state). It only fires when the incoming props actually differ
   * from the ones last synced, so a local pick is never clobbered while its
   * own save is still in flight.
   */
  const [syncedFrom, setSyncedFrom] = useState({
    winner: initialWinnerTeamId,
    bucket: initialMarginBucket,
  });
  if (
    syncedFrom.winner !== initialWinnerTeamId ||
    syncedFrom.bucket !== initialMarginBucket
  ) {
    setSyncedFrom({ winner: initialWinnerTeamId, bucket: initialMarginBucket });
    setWinnerTeamId(initialWinnerTeamId);
    setMarginBucket(initialMarginBucket);
  }

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

  /**
   * Every write goes through here, one at a time, in the order it was
   * clicked.
   *
   * Picking used to defer a `form.requestSubmit()` by an animation frame
   * and let the form serialize itself, while Clear was a submit button
   * overriding the form's action. That made a pick and a clear two
   * independent requests racing over one form, and the loser won: on a real
   * mobile connection the deferred save could settle AFTER the clear and
   * re-insert the row. It looked like the pick cleared and then re-selected
   * itself, and it survived a refresh, because the database really had been
   * written to again.
   *
   * So: no animation frame, no form submission, and the values are taken
   * from the click rather than read back out of the DOM -- hidden inputs
   * that have already been reset can't be serialized into a save. The
   * promise chain guarantees the server sees the clicks in click order even
   * when the network would not.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function send(
    action: (formData: FormData) => void,
    selection: { teamId: number; bucket: MarginBucketId } | null,
  ) {
    const data = new FormData();
    data.set("gameId", String(gameId));
    data.set("week", String(week));
    if (selection) {
      data.set("winnerTeamId", String(selection.teamId));
      data.set("marginBucket", String(selection.bucket));
    }
    // Run after whatever is already in flight, whether it succeeded or not.
    const run = queue.current.then(
      () => action(data),
      () => action(data),
    );
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    startTransition(async () => {
      try {
        await run;
      } catch {
        // Surfaced by the route's error boundary; nothing to do here beyond
        // letting the row stop looking busy.
      }
    });
  }

  function pick(teamId: number, bucket: MarginBucketId) {
    if (frozen) return;
    setWinnerTeamId(teamId);
    setMarginBucket(bucket);
    send(saveAction, { teamId, bucket });
  }

  function clear() {
    if (frozen) return;
    setWinnerTeamId(null);
    setMarginBucket(null);
    send(clearAction, null);
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
        {typeof team.rank === "number" && team.rank <= RANKED_CUTOFF && (
          <span
            className="shrink-0 font-mono text-[11px] text-ink-muted"
            title={`Ranked #${team.rank} in your Computer Rankings`}
          >
            {team.rank}
          </span>
        )}
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
    /* Still a <form> so the hidden inputs describing this pick stay in the
       markup, but nothing submits it any more -- every write is dispatched
       directly by send() above, in click order. */
    <form
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
        {isNeutral ? (
          <span
            title="Neutral site -- no home-field advantage in the rankings math"
            className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site"
          >
            N
          </span>
        ) : (
          /* Who is hosting, named once.
             The home team has always been listed first, but that is a
             convention nobody can see -- on a phone the teams simply stack,
             and on desktop they sit either side of a VS. Badges on the teams
             themselves read badly: the home side is flex-row-reverse on
             desktop, so one mark lands between the name and the logo and the
             other between the logo and the name, pointing opposite ways.
             Naming the host once, in the row that already carries the
             kickoff, says the same thing in the order a schedule is read. */
          <span className="truncate" title={`Home team: ${team1.displayName}`}>
            at {team1.displayName}
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
              type="button"
              onClick={clear}
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
