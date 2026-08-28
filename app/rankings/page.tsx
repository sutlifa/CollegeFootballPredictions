import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { computeRankMovement } from "@/lib/computerRankings";
import { getAllGames, getAllTeams, getSubmittedWeeks } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Rank change since the previous completed week. Null means there is no
 * earlier week to compare against yet, which is different from "did not
 * move" and reads as a blank rather than a dash.
 */
function RankMove({ move }: { move: number | null }) {
  if (move === null) return <span className="w-7" aria-hidden />;
  if (move === 0) {
    return (
      <span className="w-7 text-xs text-ink-muted" title="No change">
        –
      </span>
    );
  }
  const up = move > 0;
  return (
    <span
      className={`w-7 text-xs font-semibold tabular-nums ${
        up ? "text-win" : "text-loss"
      }`}
      title={`${up ? "Up" : "Down"} ${Math.abs(move)} since last week`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

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
  // Movement replays the season through the previous completed week and
  // diffs the two rankings -- two passes, not one per week.
  const { current: rankings, movement } = computeRankMovement(
    teams,
    countedGames,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Computer Rankings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A 0-100 power score -- 50 is dead average, and it climbs toward
          100 for a genuinely exceptional season (high wins, low losses,
          quality wins, no bad losses, a tough schedule). Every team starts
          the year at its preseason poll position, and that starting point
          fades out completely once teams are about six games in, so a
          finished season is decided purely by what happened on the field.
          Beating a team rated well
          above you swings your score up; beating an FCS team or an
          unranked patsy barely moves it. Losing costs a real, guaranteed
          amount every time, so a losing record can&apos;t hide behind a
          tough schedule -- fewer losses reliably beats more losses unless
          the extra-loss team has earned a real, sizable edge. Strength of
          conference factors in too: Power Four wins count for
          meaningfully more than Group of Six ones. A week counts here as soon as every
          game in it has a pick, and the arrow beside each rank shows how far
          that team moved since the previous completed week.
        </p>
        {submittedWeeks.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            No completed weeks yet -- this is the preseason poll, and it
            starts moving as soon as a week is complete.
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
                {/* Movement sits inside the Rank cell rather than taking a
                    column of its own -- six columns already crowd a phone. */}
                <td className="px-2 py-2 text-right sm:px-3">
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="font-semibold text-accent-strong">
                      {row.rank}
                    </span>
                    <RankMove move={movement.get(row.teamId) ?? null} />
                  </span>
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
                  {row.score.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
