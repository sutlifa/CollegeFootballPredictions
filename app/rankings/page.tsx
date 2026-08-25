import { TeamLogo } from "@/components/TeamLogo";
import { computeComputerRankings } from "@/lib/computerRankings";
import { getAllGames, getAllTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const [teams, games] = await Promise.all([getAllTeams(), getAllGames()]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rankings = computeComputerRankings(teams, games);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Computer Rankings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Rated with the Colley Matrix -- one of the six computer polls the
          real BCS used. It only counts wins and losses (no margin of
          victory, matching the BCS&apos;s own rule) and automatically
          factors in strength of schedule, so an untested team rates
          exactly .500 and a win over a good team counts for more.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-ink-muted">
            <tr>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left">Conference</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((row) => (
              <tr key={row.teamId} className="border-t border-line bg-surface">
                <td className="px-3 py-2 text-right font-semibold text-accent-strong">
                  {row.rank}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 text-ink">
                    <TeamLogo
                      logoUrl={teamById.get(row.teamId)?.logoUrl}
                      name={row.team}
                      size={20}
                    />
                    {row.team}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {row.conference}
                </td>
                <td className="px-3 py-2 text-right">{row.wins}</td>
                <td className="px-3 py-2 text-right">{row.losses}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {row.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rankings.length === 0 && (
        <p className="text-ink-muted">
          No predictions entered yet -- rankings will appear as you fill in
          weekly matchups.
        </p>
      )}
    </div>
  );
}
