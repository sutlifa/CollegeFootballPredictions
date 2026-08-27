import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { GamePicker } from "@/components/GamePicker";
import { Tooltip } from "@/components/Tooltip";
import {
  formatKickoff,
  getWeekLabel,
  isValidWeek,
  VALID_WEEKS,
} from "@/lib/format";
import { isMarginBucketId } from "@/lib/margin";
import {
  getAllTeams,
  getGamesForWeek,
  getWeekLocksAt,
  isWeekSubmitted,
} from "@/lib/queries";
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

  const [teams, games, weekLocksAt] = await Promise.all([
    getAllTeams(),
    getGamesForWeek(week, userId),
    getWeekLocksAt(week),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const allDecided = games.length > 0 && games.every(isDecided);
  // Picks freeze when the week's first game kicks off, the way a fantasy
  // lineup locks once the week starts.
  const weekLocked = weekLocksAt !== null && weekLocksAt.getTime() <= Date.now();

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
          <Tooltip text="The home team comes first -- on the left on a wide screen, on the top line on a phone. A neutral-site game is marked N and gets no home-field boost. Tap the margin you expect beside a team to pick that team to win by that much; it saves on the spot, and Clear removes the pick. Picks for a week freeze once that week's first game kicks off, so get them in beforehand. Once every game this week has a pick, Submit Week Results unlocks -- nothing counts toward Computer Rankings or the Bracket until you submit." />
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
      {weekLocked ? (
        <p className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink-soft">
          <span className="font-semibold text-ink">This week is locked.</span>{" "}
          Its first game kicked off {formatKickoff(weekLocksAt!.toISOString())},
          so picks can no longer be added or changed -- same as a fantasy
          lineup locking when the week starts.
        </p>
      ) : (
        <>
          {weekLocksAt && (
            <p className="text-sm text-ink-muted">
              Picks lock {formatKickoff(weekLocksAt.toISOString())}, when this
              week&apos;s first game kicks off.
            </p>
          )}
          {!allDecided && (
            <p className="text-sm text-ink-muted">
              Predict every game this week to unlock{" "}
              <span className="font-semibold text-ink">Submit Week Results</span>{" "}
              -- nothing counts toward Computer Rankings until you submit.
            </p>
          )}
        </>
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
        /* Each game is a tap-to-pick card (components/GamePicker.tsx):
           choose the winner, choose how big the win is, and it saves
           itself. Replaced two number inputs per game -- entering exact
           scores for a whole season was the single biggest reason people
           bounced off the app. */
        <div className="space-y-2">
          {games.map((game) => {
            const team1 = teamById.get(game.team1Id);
            const team2 = teamById.get(game.team2Id);
            return (
              <GamePicker
                key={game.id}
                gameId={game.id}
                week={week}
                kickoffLabel={formatKickoff(game.kickoffAt)}
                isNeutral={game.isNeutralSite || week === 16}
                team1={{
                  id: game.team1Id,
                  displayName: displayTeamName(team1),
                  logoUrl: team1?.logoUrl ?? null,
                }}
                team2={{
                  id: game.team2Id,
                  displayName: displayTeamName(team2),
                  logoUrl: team2?.logoUrl ?? null,
                }}
                locked={weekLocked}
                actualScoreTeam1={game.actualScoreTeam1}
                actualScoreTeam2={game.actualScoreTeam2}
                initialWinnerTeamId={game.predictedWinnerTeamId}
                initialMarginBucket={
                  game.predictedMarginBucket !== null &&
                  isMarginBucketId(game.predictedMarginBucket)
                    ? game.predictedMarginBucket
                    : null
                }
                saveAction={savePredictionAction}
                clearAction={clearPredictionAction}
              />
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
