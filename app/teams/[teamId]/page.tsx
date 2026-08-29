import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { GamePicker } from "@/components/GamePicker";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { computeRankings } from "@/lib/rankingModel";
import { formatKickoff, getWeekLabel } from "@/lib/format";
import { isMarginBucketId } from "@/lib/margin";
import {
  getAllGames,
  getAllTeams,
  getAllWeekLocks,
  getGamesForTeam,
  getSubmittedWeeks,
  hasWeek16Games,
  isRegularSeasonComplete,
} from "@/lib/queries";
import { syncWeek16Games } from "@/lib/syncWeek16";
import { displayTeamName, type Game, type Team } from "@/lib/types";
import {
  clearPredictionAction,
  savePredictionAction,
} from "@/app/weeks/[week]/actions";

export const dynamic = "force-dynamic";

/** Win/loss from one side's point of view, over whichever scores are given. */
function recordFor(
  games: Game[],
  teamId: number,
  scoreOf: (g: Game) => [number | null, number | null],
): { wins: number; losses: number; played: number } {
  let wins = 0;
  let losses = 0;
  for (const game of games) {
    const [s1, s2] = scoreOf(game);
    if (s1 === null || s2 === null || s1 === s2) continue;
    const winnerId = s1 > s2 ? game.team1Id : game.team2Id;
    if (winnerId === teamId) wins++;
    else losses++;
  }
  return { wins, losses, played: wins + losses };
}

export default async function TeamPage({
  params,
}: PageProps<"/teams/[teamId]">) {
  const { teamId: teamIdParam } = await params;
  const teamId = Number(teamIdParam);
  if (!Number.isInteger(teamId)) notFound();

  const session = await auth();
  const userId = session!.user.id; // proxy.ts guarantees a session here

  // Championship games appear here only once they are real: the regular
  // season is finished and the matchups have actually been decided. Before
  // that a team's schedule ends at Army-Navy, which is the honest picture --
  // a title game derived from a part-finished season put teams on a
  // schedule they had no business being on.
  //
  // Generated here only if this user has finished and simply hasn't opened
  // /weeks/16 yet. Deliberately NOT re-derived on every visit the way that
  // page does it: it costs about 1.1s, which is a lot for a page reached
  // from a list of 138, and buys nothing, since saving a pick never
  // re-derives week 16 either.
  if (
    (await isRegularSeasonComplete(userId)) &&
    !(await hasWeek16Games(userId))
  ) {
    await syncWeek16Games(userId);
  }

  // One round of concurrent queries, not two sequential ones.
  const [teams, games, weekLocks, allGames, submittedWeeks] = await Promise.all([
    getAllTeams(),
    getGamesForTeam(teamId, userId),
    getAllWeekLocks(),
    // The computer poll is a whole-season calculation, so it needs every
    // game, not just this team's -- and only weeks the user has finished.
    getAllGames(userId),
    getSubmittedWeeks(userId),
  ]);

  const team = teams.find((t) => t.id === teamId);
  if (!team) notFound();
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const submitted = new Set(submittedWeeks);
  const rankings = computeRankings(
    teams,
    allGames.filter((g) => submitted.has(g.week)),
  );
  const ranked = rankings.find((r) => r.teamId === teamId);

  const predicted = recordFor(games, teamId, (g) => [
    g.predictedScoreTeam1,
    g.predictedScoreTeam2,
  ]);
  const actual = recordFor(games, teamId, (g) => [
    g.actualScoreTeam1,
    g.actualScoreTeam2,
  ]);
  const picked = games.filter((g) => g.predictedWinnerTeamId !== null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <TeamLogo logoUrl={team.logoUrl} name={team.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-ink">
            {displayTeamName(team)}
            <Tooltip text="Every game this team plays, week 0 through the conference championship, with your pick on each one. Picks made here are the same picks as on the week pages -- change one in either place and it changes in both. A week freezes once its first game kicks off." />
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {team.conference}
            {team.preseasonRank !== null && (
              <> &middot; preseason #{team.preseasonRank}</>
            )}
            {ranked && (
              <>
                {" "}
                &middot; computer rank{" "}
                <span className="font-semibold text-accent-strong">
                  #{ranked.rank}
                </span>{" "}
                ({ranked.score.toFixed(3)})
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-ink-muted">
            Your predicted record
          </div>
          <div className="mt-0.5 font-mono text-xl text-ink">
            {predicted.wins}-{predicted.losses}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-ink-muted">
            Actual record
          </div>
          <div className="mt-0.5 font-mono text-xl text-ink">
            {actual.played > 0 ? (
              `${actual.wins}-${actual.losses}`
            ) : (
              <span className="text-base text-ink-muted">
                no games played yet
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-ink-muted">
            Games picked
          </div>
          <div className="mt-0.5 font-mono text-xl text-ink">
            {picked}/{games.length}
          </div>
        </div>
      </div>

      {games.length === 0 ? (
        <p className="text-ink-muted">
          No games scheduled for this team yet. Seed the schedule first.
        </p>
      ) : (
        <div className="space-y-2">
          {games.map((game) => {
            const team1 = teamById.get(game.team1Id);
            const team2 = teamById.get(game.team2Id);
            const lock = weekLocks.get(game.week) ?? null;
            const locked = lock?.locked ?? false;
            const opponent =
              game.team1Id === teamId ? team2 : (team1 as Team | undefined);
            return (
              <div key={game.id}>
                {/* Which week this is, and whether it can still be edited --
                    a full season on one page mixes locked and open weeks,
                    which the week pages never have to show. */}
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <Link
                    href={`/weeks/${game.week}`}
                    className="font-semibold text-ink-soft hover:text-accent-strong"
                  >
                    {getWeekLabel(game.week)}
                  </Link>
                  <span className="text-ink-muted">
                    {game.isConferenceChampionship
                      ? `${game.conference} Championship`
                      : game.team1Id === teamId
                        ? game.isNeutralSite
                          ? `vs ${displayTeamName(opponent)} (neutral)`
                          : `vs ${displayTeamName(opponent)}`
                        : game.isNeutralSite
                          ? `vs ${displayTeamName(opponent)} (neutral)`
                          : `at ${displayTeamName(opponent)}`}
                  </span>
                  {locked && lock && (
                    <span className="text-ink-muted">
                      &middot; locked {formatKickoff(lock.locksAt.toISOString())}
                    </span>
                  )}
                </div>
                <GamePicker
                  gameId={game.id}
                  week={game.week}
                  kickoffLabel={formatKickoff(game.kickoffAt, game.kickoffTbd)}
                  isNeutral={game.isNeutralSite || game.week === 16}
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
                  locked={locked}
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
              </div>
            );
          })}
        </div>
      )}

      <p className="text-sm text-ink-muted">
        Picking here is the same as picking on the week pages -- a week still
        counts toward Computer Rankings automatically once every game in it
        has a pick, including the games not shown here.
      </p>
    </div>
  );
}
