import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { computeComputerRankings } from "@/lib/computerRankings";
import { getAllGames, getAllTeams, getSubmittedWeeks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [teams, allGames, submittedWeeks] = await Promise.all([
    getAllTeams(),
    getAllGames(userId),
    getSubmittedWeeks(userId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const submitted = new Set(submittedWeeks);
  const countedGames = allGames.filter((g) => submitted.has(g.week));
  const rankings = computeComputerRankings(teams, countedGames);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Computer Rankings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          An Elo-style rating, earned entirely from this season&apos;s
          results -- every team starts at a neutral 0, no preseason poll
          baked in. Beating a team rated well above you swings your rating a
          lot; beating an FCS team or an unranked patsy barely moves it.
          Losing costs more than a plain mirror of what the winner gained,
          even against a good team, so a losing record can&apos;t hide
          behind a tough schedule. Strength of conference factors in too,
          based on how that conference is actually performing this season,
          not a preseason label. Nothing from a week counts here until you
          hit{" "}
          <span className="font-semibold text-ink">Submit Week Results</span>{" "}
          on that week&apos;s page.
        </p>
        {submittedWeeks.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            No weeks submitted yet -- everyone starts even at 0.
          </p>
        )}
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
              <th className="px-3 py-2 text-right">Rating</th>
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
                  {row.score.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
