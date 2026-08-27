import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import {
  formatKickoff,
  getWeekLabel,
  isValidWeek,
  VALID_WEEKS,
} from "@/lib/format";
import { getAllTeams, getGamesForWeek, isWeekSubmitted } from "@/lib/queries";
import { syncWeek16Games } from "@/lib/syncWeek16";
import { displayTeamName, isDecided } from "@/lib/types";
import {
  clearPredictionAction,
  savePredictionAction,
  submitWeekAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function WeekPage({
  params,
}: PageProps<"/weeks/[week]">) {
  const { week: weekParam } = await params;
  const week = Number(weekParam);
  if (!isValidWeek(week)) {
    notFound();
  }

  const session = await auth();
  const userId = session!.user.id; // proxy.ts guarantees a session here

  const submitted = await isWeekSubmitted(userId, week);

  // Once Week 16 is submitted, its matchups are locked in for good -- if
  // this kept re-deriving on every visit, any later shift in the derived
  // top two (an earlier week's prediction changing, or the tiebreaker-
  // resolved standings finalizing for the first time) would silently swap
  // out the games the user already predicted/submitted against.
  if (week === 16 && !submitted) {
    await syncWeek16Games(userId);
  }

  const [teams, games] = await Promise.all([
    getAllTeams(),
    getGamesForWeek(week, userId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const allDecided = games.length > 0 && games.every(isDecided);

  const weekIndex = VALID_WEEKS.indexOf(week);
  const prevWeek = weekIndex > 0 ? VALID_WEEKS[weekIndex - 1] : null;
  const nextWeek =
    weekIndex >= 0 && weekIndex < VALID_WEEKS.length - 1
      ? VALID_WEEKS[weekIndex + 1]
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {prevWeek !== null ? (
          <Link
            href={`/weeks/${prevWeek}`}
            className="flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
          >
            ← {getWeekLabel(prevWeek)}
          </Link>
        ) : (
          <span />
        )}
        {nextWeek !== null ? (
          <Link
            href={`/weeks/${nextWeek}`}
            className="flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
          >
            {getWeekLabel(nextWeek)} →
          </Link>
        ) : (
          <span />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          {getWeekLabel(week)}
          <Tooltip text="The home team comes first -- on the left on a wide screen, on the top line on a phone. A neutral-site game is marked N and gets no home-field boost. Enter your predicted final score for both teams, then hit Save (Clear removes a prediction). Once every game this week has one, Submit Week Results unlocks -- nothing counts toward Computer Rankings or the Bracket until you submit." />
        </h1>
        {allDecided && (
          <div className="flex items-center gap-3">
            {submitted && (
              <span className="text-sm font-medium text-win">
                ✓ Submitted -- counted in Computer Rankings
              </span>
            )}
            <form action={submitWeekAction}>
              <input type="hidden" name="week" value={week} />
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
              >
                {submitted ? "Re-submit Week Results" : "Submit Week Results"}
              </button>
            </form>
          </div>
        )}
      </div>
      {!allDecided && (
        <p className="text-sm text-ink-muted">
          Predict every game this week to unlock{" "}
          <span className="font-semibold text-ink">Submit Week Results</span>{" "}
          -- nothing counts toward Computer Rankings until you submit.
        </p>
      )}

      {week === 16 && (
        <p className="text-sm text-ink-muted">
          Matchups here are derived from your Weeks 1-15 predicted standings
          (each conference&apos;s top two teams), not pulled from an API. If an
          earlier prediction changes who&apos;s in it, a matchup&apos;s score
          resets. Championship games are treated as neutral site.
        </p>
      )}

      {games.length === 0 ? (
        <p className="text-ink-muted">
          {week <= 15
            ? "No games seeded yet for this week. Run the schedule sync first."
            : "No conference has a decided top two yet -- predict more of weeks 1-15."}
        </p>
      ) : (
        /* Each game is one responsive grid, not a row inside a wide fixed-width
           table -- the old layout had min-w-[860px] inside an overflow-x-auto
           wrapper, which meant entering a score on a phone required scrolling
           sideways for every single game. On small screens each game now
           stacks: kickoff on its own line, then one line per team with that
           team's score box beside it, then the buttons. From `sm` up it lays
           back out as the original seven-column row. Both use the SAME inputs
           (reordered with `order-*`), so there's no duplicate form state. */
        <div className="space-y-2">
          <div className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase sm:grid sm:grid-cols-[10.5rem_minmax(0,1fr)_4.5rem_2.75rem_4.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
            <span>Kickoff (ET)</span>
            <span className="text-right">Home</span>
            <span className="text-center">Score</span>
            <span />
            <span className="text-center">Score</span>
            <span>Away</span>
            <span />
          </div>

          {games.map((game) => {
            const isNeutral = game.isNeutralSite || week === 16;
            const team1 = teamById.get(game.team1Id);
            const team2 = teamById.get(game.team2Id);
            const hasPrediction =
              game.predictedScoreTeam1 !== null &&
              game.predictedScoreTeam2 !== null;

            return (
              <form
                key={game.id}
                action={savePredictionAction}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3 py-3 odd:bg-surface/60 sm:grid-cols-[10.5rem_minmax(0,1fr)_4.5rem_2.75rem_4.5rem_minmax(0,1fr)_auto] sm:gap-y-0 sm:py-2.5"
              >
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="week" value={week} />

                <span className="order-1 col-span-2 flex items-center gap-2 text-xs text-ink-muted sm:col-span-1 sm:whitespace-nowrap">
                  {formatKickoff(game.kickoffAt)}
                  {isNeutral && (
                    <span
                      title="Neutral site -- no home-field advantage in the rankings math"
                      className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site sm:hidden"
                    >
                      N
                    </span>
                  )}
                </span>

                {/* flex-row-reverse + justify-end puts the logo first and packs
                    left on mobile; from sm it flips back to name-then-logo,
                    right-aligned against the score box. */}
                <span className="order-2 flex min-w-0 flex-row-reverse items-center justify-end gap-2 font-medium text-ink sm:flex-row sm:justify-end sm:text-right">
                  <span className="truncate">{displayTeamName(team1)}</span>
                  <TeamLogo logoUrl={team1?.logoUrl} name={team1?.name ?? ""} />
                </span>

                <input
                  type="number"
                  name="score1"
                  min={0}
                  inputMode="numeric"
                  aria-label={`${displayTeamName(team1)} predicted score`}
                  defaultValue={game.predictedScoreTeam1 ?? ""}
                  className="order-3 w-full rounded border border-line-strong bg-field px-2 py-2 text-center text-ink sm:py-1"
                  required
                />

                <span className="order-4 hidden justify-center sm:flex">
                  {isNeutral ? (
                    <span
                      title="Neutral site -- no home-field advantage in the rankings math"
                      className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site"
                    >
                      N
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold tracking-wide text-ink-muted">
                      VS
                    </span>
                  )}
                </span>

                <input
                  type="number"
                  name="score2"
                  min={0}
                  inputMode="numeric"
                  aria-label={`${displayTeamName(team2)} predicted score`}
                  defaultValue={game.predictedScoreTeam2 ?? ""}
                  className="order-5 w-full rounded border border-line-strong bg-field px-2 py-2 text-center text-ink sm:py-1"
                  required
                />

                <span className="order-4 flex min-w-0 items-center gap-2 font-medium text-ink sm:order-6">
                  <TeamLogo logoUrl={team2?.logoUrl} name={team2?.name ?? ""} />
                  <span className="truncate">{displayTeamName(team2)}</span>
                </span>

                <span className="order-6 col-span-2 flex justify-end gap-2 sm:order-7 sm:col-span-1">
                  <button
                    type="submit"
                    className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong sm:px-3 sm:py-1.5"
                  >
                    Save
                  </button>
                  {hasPrediction && (
                    <button
                      type="submit"
                      formAction={clearPredictionAction}
                      formNoValidate
                      className="rounded border border-line-strong px-4 py-2 text-sm text-ink-soft hover:border-accent hover:text-accent-strong sm:px-3 sm:py-1.5"
                    >
                      Clear
                    </button>
                  )}
                </span>
              </form>
            );
          })}
        </div>
      )}

      {allDecided && (
        <div className="flex items-center justify-center gap-3">
          {submitted && (
            <span className="text-sm font-medium text-win">
              ✓ Submitted -- counted in Computer Rankings
            </span>
          )}
          <form action={submitWeekAction}>
            <input type="hidden" name="week" value={week} />
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
            >
              {submitted ? "Re-submit Week Results" : "Submit Week Results"}
            </button>
          </form>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {prevWeek !== null ? (
          <Link
            href={`/weeks/${prevWeek}`}
            className="flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
          >
            ← {getWeekLabel(prevWeek)}
          </Link>
        ) : (
          <span />
        )}
        {nextWeek !== null ? (
          <Link
            href={`/weeks/${nextWeek}`}
            className="flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
          >
            {getWeekLabel(nextWeek)} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
