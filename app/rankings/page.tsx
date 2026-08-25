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
      <h1 className="text-2xl font-semibold">Computer Rankings</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
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
              <tr key={row.teamId}>
                <td className="px-3 py-2 text-right">{row.rank}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <TeamLogo
                      logoUrl={teamById.get(row.teamId)?.logoUrl}
                      name={row.team}
                      size={20}
                    />
                    {row.team}
                  </span>
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {row.conference}
                </td>
                <td className="px-3 py-2 text-right">{row.wins}</td>
                <td className="px-3 py-2 text-right">{row.losses}</td>
                <td className="px-3 py-2 text-right">
                  {row.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rankings.length === 0 && (
        <p className="text-neutral-400">
          No predictions entered yet -- rankings will appear as you fill in
          weekly matchups.
        </p>
      )}
    </div>
  );
}
