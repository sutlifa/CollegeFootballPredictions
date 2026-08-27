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
          A 0-100 power score -- 50 is dead average, and it climbs toward
          100 for a genuinely exceptional season (high wins, low losses,
          quality wins, no bad losses, a tough schedule). Every team starts
          at 50, no preseason poll baked in. Beating a team rated well
          above you swings your score up; beating an FCS team or an
          unranked patsy barely moves it. Losing costs a real, guaranteed
          amount every time, so a losing record can&apos;t hide behind a
          tough schedule -- fewer losses reliably beats more losses unless
          the extra-loss team has earned a real, sizable edge. Strength of
          conference factors in too: Power Four wins count for
          meaningfully more than Group of Six ones. Nothing from a week
          counts here until you hit{" "}
          <span className="font-semibold text-ink">Submit Week Results</span>{" "}
          on that week&apos;s page.
        </p>
        {submittedWeeks.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            No weeks submitted yet -- everyone starts even at 50.
          </p>
        )}
      </div>
      {/* The Conference column is dropped on phones -- six columns don't fit
          in ~375px without sideways scrolling -- and folded under the team
          name instead, so nothing is actually lost. */}
      <div className="rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-ink-muted">
            <tr>
              <th className="px-2 py-2 text-right sm:px-3">Rank</th>
              <th className="px-2 py-2 text-left sm:px-3">Team</th>
              <th className="hidden px-3 py-2 text-left sm:table-cell">Conference</th>
              <th className="px-2 py-2 text-right sm:px-3">W</th>
              <th className="px-2 py-2 text-right sm:px-3">L</th>
              <th className="px-2 py-2 text-right sm:px-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((row) => (
              <tr key={row.teamId} className="border-t border-line bg-surface">
                <td className="px-2 py-2 text-right font-semibold text-accent-strong sm:px-3">
                  {row.rank}
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <span className="flex items-center gap-2 text-ink">
                    <TeamLogo
                      logoUrl={teamById.get(row.teamId)?.logoUrl}
                      name={row.team}
                      size={20}
                    />
                    <span className="min-w-0">
                      <span className="block leading-tight">{row.team}</span>
                      <span className="block text-xs leading-tight text-ink-muted sm:hidden">
                        {row.conference}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-ink-muted sm:table-cell">
                  {row.conference}
                </td>
                <td className="px-2 py-2 text-right sm:px-3">{row.wins}</td>
                <td className="px-2 py-2 text-right sm:px-3">{row.losses}</td>
                <td className="px-2 py-2 text-right font-mono sm:px-3">
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
