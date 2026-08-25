import { computeAccuracySummary } from "@/lib/accuracy";
import { getAllGames, getAllTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const [teams, games] = await Promise.all([getAllTeams(), getAllGames()]);
  const summary = computeAccuracySummary(teams, games);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Prediction Accuracy</h1>
        <p className="mt-1 text-neutral-400">
          Compares your predicted scores against real results, synced daily
          once games are actually played.
        </p>
      </div>

      {summary.gamesComparable === 0 ? (
        <p className="text-neutral-400">
          No completed games yet -- check back once the season is underway.
        </p>
      ) : (
        <>
          <div className="flex gap-6">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-sm text-neutral-400">Correct winner</div>
              <div className="text-2xl font-semibold">
                {((summary.correctWinnerRate ?? 0) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-sm text-neutral-400">
                Avg. combined score error
              </div>
              <div className="text-2xl font-semibold">
                {(summary.averageAbsoluteError ?? 0).toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-sm text-neutral-400">Games compared</div>
              <div className="text-2xl font-semibold">
                {summary.gamesComparable}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
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
                  <tr key={row.gameId}>
                    <td className="px-3 py-2 text-right">{row.week}</td>
                    <td className="px-3 py-2">
                      {row.team1} vs {row.team2}
                    </td>
                    <td className="px-3 py-2">
                      {row.predictedScoreTeam1}-{row.predictedScoreTeam2}
                    </td>
                    <td className="px-3 py-2">
                      {row.actualScoreTeam1}-{row.actualScoreTeam2}
                    </td>
                    <td className="px-3 py-2">
                      {row.correctWinner ? (
                        <span className="text-emerald-400">Correct</span>
                      ) : (
                        <span className="text-red-400">Missed</span>
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
