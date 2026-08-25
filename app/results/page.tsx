import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { computeAccuracySummary } from "@/lib/accuracy";
import { getAllGames, getAllTeams } from "@/lib/queries";
import { displayTeamName } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const session = await auth();
  const [teams, games] = await Promise.all([
    getAllTeams(),
    getAllGames(session!.user.id),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const summary = computeAccuracySummary(teams, games);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Prediction Accuracy</h1>
        <p className="mt-1 text-ink-muted">
          Compares your predicted scores against real results, synced daily
          once games are actually played.
        </p>
      </div>

      {summary.gamesComparable === 0 ? (
        <p className="text-ink-muted">
          No completed games yet -- check back once the season is underway.
        </p>
      ) : (
        <>
          <div className="flex gap-6">
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="text-sm text-ink-muted">Correct winner</div>
              <div className="text-2xl font-bold text-accent-strong">
                {((summary.correctWinnerRate ?? 0) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-1 text-sm text-ink-muted">
                Avg. combined score error
                <Tooltip text="Per game: |your predicted score - actual score| added up for both teams, then averaged across every completed game. Lower is better; 0 would mean a perfect final-score prediction." />
              </div>
              <div className="text-2xl font-bold text-ink">
                {(summary.averageAbsoluteError ?? 0).toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="text-sm text-ink-muted">Games compared</div>
              <div className="text-2xl font-bold text-ink">
                {summary.gamesComparable}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-right">Wk</th>
                  <th className="px-3 py-2 text-left">Matchup</th>
                  <th className="px-3 py-2 text-left">Predicted</th>
                  <th className="px-3 py-2 text-left">Actual</th>
                  <th className="px-3 py-2 text-left">Winner?</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.gameId} className="border-t border-line bg-surface text-ink">
                    <td className="px-3 py-2 text-right">{row.week}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <TeamLogo logoUrl={teamById.get(row.team1Id)?.logoUrl} name={row.team1} size={18} />
                        {displayTeamName(teamById.get(row.team1Id))}
                      </span>{" "}
                      vs{" "}
                      <span className="inline-flex items-center gap-1">
                        <TeamLogo logoUrl={teamById.get(row.team2Id)?.logoUrl} name={row.team2} size={18} />
                        {displayTeamName(teamById.get(row.team2Id))}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.predictedScoreTeam1}-{row.predictedScoreTeam2}
                    </td>
                    <td className="px-3 py-2">
                      {row.actualScoreTeam1}-{row.actualScoreTeam2}
                    </td>
                    <td className="px-3 py-2">
                      {row.correctWinner ? (
                        <span className="font-medium text-win">Correct</span>
                      ) : (
                        <span className="font-medium text-loss">Missed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
