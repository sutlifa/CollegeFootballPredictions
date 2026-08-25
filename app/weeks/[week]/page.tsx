import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { formatKickoff, getWeekLabel, isValidWeek } from "@/lib/format";
import { getAllTeams, getGamesForWeek } from "@/lib/queries";
import { syncWeek16Games } from "@/lib/syncWeek16";
import { displayTeamName } from "@/lib/types";
import { clearPredictionAction, savePredictionAction } from "./actions";

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

  if (week === 16) {
    await syncWeek16Games(userId);
  }

  const [teams, games] = await Promise.all([
    getAllTeams(),
    getGamesForWeek(week, userId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{getWeekLabel(week)}</h1>

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
        <div className="overflow-x-auto">
          <div className="grid min-w-[820px] grid-cols-[8.5rem_minmax(0,1fr)_4.5rem_2.75rem_4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
            <div className="col-span-full grid grid-cols-subgrid px-3 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              <span>Kickoff (ET)</span>
              <span>Home</span>
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
                  className="col-span-full grid grid-cols-subgrid items-center rounded-lg border border-line bg-surface px-3 py-2.5 odd:bg-surface/60"
                >
                  <input type="hidden" name="gameId" value={game.id} />
                  <input type="hidden" name="week" value={week} />

                  <span className="text-xs text-ink-muted">
                    {formatKickoff(game.kickoffAt)}
                  </span>

                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <TeamLogo logoUrl={team1?.logoUrl} name={team1?.name ?? ""} />
                    <span className="truncate">{displayTeamName(team1)}</span>
                  </span>

                  <input
                    type="number"
                    name="score1"
                    min={0}
                    defaultValue={game.predictedScoreTeam1 ?? ""}
                    className="w-full rounded border border-line-strong bg-field px-2 py-1 text-center text-ink"
                    required
                  />

                  <span className="flex justify-center">
                    {isNeutral ? (
                      <span
                        title="Neutral site -- no home-field advantage in the rankings math"
                        className="rounded-full bg-neutral-site/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-site"
                      >
                        N
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">@</span>
                    )}
                  </span>

                  <input
                    type="number"
                    name="score2"
                    min={0}
                    defaultValue={game.predictedScoreTeam2 ?? ""}
                    className="w-full rounded border border-line-strong bg-field px-2 py-1 text-center text-ink"
                    required
                  />

                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <TeamLogo logoUrl={team2?.logoUrl} name={team2?.name ?? ""} />
                    <span className="truncate">{displayTeamName(team2)}</span>
                  </span>

                  <span className="flex justify-end gap-2">
                    <button
                      type="submit"
                      className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
                    >
                      Save
                    </button>
                    {hasPrediction && (
                      <button
                        type="submit"
                        formAction={clearPredictionAction}
                        formNoValidate
                        className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
                      >
                        Clear
                      </button>
                    )}
                  </span>
                </form>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
