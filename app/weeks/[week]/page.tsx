import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ClearWeekButton } from "@/components/ClearWeekButton";
import { FillWeekButton } from "@/components/FillWeekButton";
import { GamePicker } from "@/components/GamePicker";
import { Tooltip } from "@/components/Tooltip";
import {
  formatKickoff,
  getWeekLabel,
  isValidWeek,
  VALID_WEEKS,
} from "@/lib/format";
import { computeRankings } from "@/lib/rankingModel";
import { defaultPickFor } from "@/lib/defaultPick";
import { isMarginBucketId } from "@/lib/margin";
import {
  fillWeekDefaults,
  getAllGames,
  getAllTeams,
  getGamesForWeek,
  getSubmittedWeeks,
  getWeekLocksAt,
  getWeekPickBreakdown,
  isWeekLocked,
  isWeekSubmitted,
  missingRegularSeasonWeeks,
} from "@/lib/queries";
import { syncWeek16Games } from "@/lib/syncWeek16";
import { displayTeamName, isDecided } from "@/lib/types";
import {
  clearPredictionAction,
  clearWeekAction,
  fillWeekDefaultsAction,
  savePredictionAction,
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

  // Settled games fill themselves the first time a week is opened, so the
  // page you land on already has the blowouts decided and only the real
  // decisions left. Only games nobody has picked, only ones the rank gap
  // calls settled, and never in a locked week -- fillWeekDefaults refuses
  // those, so this is wrapped rather than allowed to blow up the page.
  if (!(await isWeekLocked(week))) {
    try {
      await fillWeekDefaults(userId, week, { settledOnly: true });
    } catch {
      // A failure here must not stop someone reaching their picks.
    }
  }

  const [teams, games, weekLocksAt, missingWeeks, allGames, submittedWeeks] =
    await Promise.all([
      getAllTeams(),
      getGamesForWeek(week, userId),
      getWeekLocksAt(week),
      week === 16 ? missingRegularSeasonWeeks(userId) : Promise.resolve([]),
      getAllGames(userId),
      getSubmittedWeeks(userId),
    ]);
  const breakdown = await getWeekPickBreakdown(userId, week);

  // Ranks come from this user's own Computer Rankings, so they move as the
  // season they predicted unfolds. Nothing to schedule: the board is
  // computed on read from the latest picks and results, so it is already as
  // live as the data behind it.
  const submittedSet = new Set(submittedWeeks);
  const rankByTeam = new Map(
    computeRankings(
      teams,
      allGames.filter((g) => submittedSet.has(g.week)),
    ).map((r) => [r.teamId, r.rank]),
  );
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const picked = games.filter((g) => g.predictedWinnerTeamId !== null).length;
  // Of the games still unpicked, how many does the preseason gap consider
  // settled? Fill offers a different bargain for 40 formalities than for a
  // dozen real decisions, so it says which it is before doing anything.
  const unpicked = games.filter((g) => g.predictedWinnerTeamId === null);
  const settledRemaining = unpicked.filter(
    (g) =>
      defaultPickFor(
        teamById.get(g.team1Id),
        teamById.get(g.team2Id),
        g.team1Id,
        g.team2Id,
        rankByTeam,
      ).settled,
  ).length;
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
          <Tooltip text="The home team comes first -- on the left on a wide screen, on the top line on a phone. A neutral-site game is marked N and gets no home-field boost. Tap the margin you expect beside a team to pick that team to win by that much; it saves on the spot, and Clear removes the pick. Picks for a week freeze once that week's first game kicks off, so get them in beforehand. The week counts toward Computer Rankings and the Bracket automatically once every game has a pick -- there is no Submit button, and changing a pick in a finished week just re-counts it." />
        </h1>
        {/* No Submit button: a week submits itself once every game has a
            pick (see settleWeek in ./actions.ts), so this only reports
            where the week stands. */}
        <span className="flex flex-wrap items-center gap-3">
          {submitted ? (
            <span className="text-sm font-medium text-win">
              ✓ Complete -- counted in Computer Rankings
            </span>
          ) : (
            <span className="text-sm text-ink-muted">
              {picked} of {games.length} picked
            </span>
          )}
          {/* Only while the week is still open -- the server refuses a
              locked week, and a button that can only fail is worse than
              no button. */}
          {!weekLocked && (
            <>
              <FillWeekButton
                week={week}
                remaining={unpicked.length}
                settled={settledRemaining}
                fillAction={fillWeekDefaultsAction}
              />
              <ClearWeekButton
                week={week}
                chosen={breakdown.chosen}
                defaults={breakdown.defaults}
                clearAction={clearWeekAction}
              />
            </>
          )}
        </span>
      </div>
      {weekLocked ? (
        <p className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink-soft">
          <span className="font-bold text-ink">This week is locked.</span> Its
          first game kicked off{" "}
          <span className="font-bold text-ink">
            {formatKickoff(weekLocksAt!.toISOString())}
          </span>
          , so picks can no longer be added or changed -- same as a fantasy
          lineup locking when the week starts.
        </p>
      ) : (
        <>
          {weekLocksAt && (
            <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-ink-soft">
              Picks lock{" "}
              <span className="font-bold text-accent-strong">
                {formatKickoff(weekLocksAt.toISOString())}
              </span>
              , when this week&apos;s first game kicks off.
            </p>
          )}
        </>
      )}

      {breakdown.defaults > 0 && !weekLocked && (
        /* One line by default. The reasoning matters the first time and is
           clutter every time after, and on a phone it pushed the actual
           games below the fold -- so it lives behind a disclosure rather
           than being duplicated at two widths. */
        <details className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-ink-soft">
          <summary className="cursor-pointer list-none">
            <span className="font-bold text-accent-strong">
              {breakdown.defaults} lopsided game
              {breakdown.defaults === 1 ? "" : "s"} filled in for you.
            </span>{" "}
            <span className="text-ink-muted underline decoration-dotted">
              Why?
            </span>
          </summary>
          <p className="mt-2">
            A season is nearly 900 games and most aren&apos;t a decision -- a
            top-ten side hosting an FCS team isn&apos;t an opinion. These went
            to the better-ranked team, by a margin based on how far apart the
            two are, using the ranks shown beside each name. Against this
            group&apos;s own picks that favorite is the one most people chose
            93% of the time. Change any of them like a normal pick, which
            marks it as yours -- or use Clear week to remove only the ones you
            picked yourself. Closer games are left for you.
          </p>
        </details>
      )}

      {week === 16 && missingWeeks.length > 0 && (
        <p className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink-soft">
          <span className="font-bold text-ink">
            Championship matchups aren&apos;t set yet.
          </span>{" "}
          They&apos;re decided by your own final standings, so they only
          appear once the whole regular season is in. Still to pick:{" "}
          <span className="font-semibold text-ink">
            {missingWeeks.map((w) => getWeekLabel(w)).join(", ")}
          </span>
          .
        </p>
      )}
      {week === 16 && missingWeeks.length === 0 && (
        <p className="text-sm text-ink-muted">
          Matchups here are derived from your own final standings (each
          conference&apos;s top two teams), not pulled from an API. If an
          earlier prediction changes who&apos;s in it, a matchup&apos;s pick
          resets. Championship games are treated as neutral site.
        </p>
      )}

      {games.length === 0 ? (
        <p className="text-ink-muted">
          {week <= 15
            ? "No games seeded yet for this week. Run the schedule sync first."
            : "Nothing here yet -- finish the regular season and each conference's top two will appear."}
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
                kickoffLabel={formatKickoff(game.kickoffAt, game.kickoffTbd)}
                isNeutral={game.isNeutralSite || week === 16}
                team1={{
                  id: game.team1Id,
                  displayName: displayTeamName(team1),
                  logoUrl: team1?.logoUrl ?? null,
                  rank: rankByTeam.get(game.team1Id) ?? null,
                }}
                team2={{
                  id: game.team2Id,
                  displayName: displayTeamName(team2),
                  logoUrl: team2?.logoUrl ?? null,
                  rank: rankByTeam.get(game.team2Id) ?? null,
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
