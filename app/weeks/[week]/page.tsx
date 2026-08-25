import { notFound } from "next/navigation";
import { TeamLogo } from "@/components/TeamLogo";
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
  if (!Number.isInteger(week) || week < 1 || week > 16) {
    notFound();
  }

  if (week === 16) {
    await syncWeek16Games();
  }

  const [teams, games] = await Promise.all([
    getAllTeams(),
    getGamesForWeek(week),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {week === 16 ? "Championship Week" : `Week ${week}`}
      </h1>

      {week === 16 && (
        <p className="text-sm text-neutral-400">
          Matchups here are derived from your Weeks 1-15 predicted standings
          (each conference&apos;s top two teams), not pulled from an API. If an
          earlier prediction changes who&apos;s in it, a matchup&apos;s score
          resets.
        </p>
      )}

      {games.length === 0 ? (
        <p className="text-neutral-400">
          {week <= 15
            ? "No games seeded yet for this week. Run the schedule sync first."
            : "No conference has a decided top two yet -- predict more of weeks 1-15."}
        </p>
      ) : (
        <div className="space-y-3">
          {games.map((game) => {
            const team1 = teamById.get(game.team1Id);
            const team2 = teamById.get(game.team2Id);
            const hasPrediction =
              game.predictedScoreTeam1 !== null &&
              game.predictedScoreTeam2 !== null;
            return (
              <form
                key={game.id}
                action={savePredictionAction}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
              >
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="week" value={week} />
                <div className="flex flex-1 items-center justify-between gap-4 min-w-[280px]">
                  <span className="flex items-center gap-2 font-medium">
                    <TeamLogo logoUrl={team1?.logoUrl} name={team1?.name ?? ""} />
                    {displayTeamName(team1)}
                    {game.isNeutralSite ? "" : game.team1IsHome ? "" : " (away)"}
                  </span>
                  <input
                    type="number"
                    name="score1"
                    min={0}
                    defaultValue={game.predictedScoreTeam1 ?? ""}
                    className="w-20 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-right"
                    required
                  />
                </div>
                <span className="text-neutral-500">vs</span>
                <div className="flex flex-1 items-center justify-between gap-4 min-w-[280px]">
                  <span className="flex items-center gap-2 font-medium">
                    <TeamLogo logoUrl={team2?.logoUrl} name={team2?.name ?? ""} />
                    {displayTeamName(team2)}
                    {game.isNeutralSite ? "" : game.team1IsHome === false ? "" : " (away)"}
                  </span>
                  <input
                    type="number"
                    name="score2"
                    min={0}
                    defaultValue={game.predictedScoreTeam2 ?? ""}
                    className="w-20 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-right"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
                >
                  Save
                </button>
                {hasPrediction && (
                  <button
                    type="submit"
                    formAction={clearPredictionAction}
                    formNoValidate
                    className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
                  >
                    Clear
                  </button>
                )}
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
