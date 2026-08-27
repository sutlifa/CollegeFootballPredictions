import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { hasGradedResults, sortLeaderboard } from "@/lib/leaderboard";
import {
  getAllBracketPicks,
  getAllTeams,
  getLeaderboard,
  getRealPlayoffRounds,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [rows, bracketPicksByUser, realPlayoffRounds, teams] = await Promise.all([
    getLeaderboard(),
    getAllBracketPicks(),
    getRealPlayoffRounds(),
    getAllTeams(),
  ]);
  const sortedRows = sortLeaderboard(rows);
  // Before any real result exists there is nothing to be "correct" about, so
  // the scoring columns would just be a wall of 0.0% -- the board shows how
  // far along everyone's picks are instead until the first game is graded.
  const seasonStarted = hasGradedResults(rows);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const realField = realPlayoffRounds.field ?? null;
  const realFieldSet = new Set(realField ?? []);

  const playoffRows = bracketPicksByUser
    .map((user) => ({
      ...user,
      // How many of their 12 are in the real playoff field. Only meaningful
      // once the real field has actually been entered.
      fieldCorrect: realField
        ? user.teamIds.filter((id) => realFieldSet.has(id)).length
        : null,
    }))
    .sort((a, b) => {
      if (a.fieldCorrect !== b.fieldCorrect) {
        return (b.fieldCorrect ?? -1) - (a.fieldCorrect ?? -1);
      }
      return a.displayName.localeCompare(b.displayName);
    });

  const teamChip = (teamId: number, highlight: boolean) => {
    const team = teamById.get(teamId);
    return (
      <span
        key={teamId}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
          highlight
            ? "border-win/60 bg-win/10 text-win"
            : "border-line-strong bg-field text-ink-soft"
        }`}
      >
        <TeamLogo logoUrl={team?.logoUrl ?? null} name={team?.name ?? ""} size={16} />
        {team?.name ?? "Unknown"}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Leaderboard
          <Tooltip text="Everyone who's signed in. Picked shows how much of your slate you've filled in (your own Week 16 championship games count toward your total, so the denominator can differ slightly between people). Winners is the share of your graded picks where you had the right team. Margin is how often you also nailed the margin bucket (1-7, 8-14, 15-21, 22+) -- counted only on games you already picked the right winner for, since getting the margin 'right' on a game you picked backwards isn't worth anything. Only first name + last initial are shown; no one else's picks are visible." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {seasonStarted
            ? "Correct winners and margin accuracy across every signed-in predictor -- updates daily as real results come in."
            : "The season hasn't started, so there's nothing to score yet -- this shows how far along everyone's picks are. Winner and margin standings take over once real results start coming in."}
        </p>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-ink-muted">No one has signed in yet.</p>
      ) : (
        /* Picked (how much of the slate is filled in) is always shown -- it's
           the whole board before the season starts. The scoring columns only
           appear once something has actually been graded; until then they'd
           be a wall of zeroes. On phones the rawest columns drop out and fold
           into the cells that remain, so the table fits without sideways
           scrolling. */
        <div className="rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-right sm:px-3">#</th>
                <th className="px-2 py-2 text-left sm:px-3">Name</th>
                <th className="px-2 py-2 text-right sm:px-3">Picked</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">
                  Games picked
                </th>
                {seasonStarted && (
                  <>
                    <th className="px-2 py-2 text-right sm:px-3">Winners</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">
                      Correct / graded
                    </th>
                    <th className="px-2 py-2 text-right sm:px-3">Margin</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">
                      Margin hits
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={row.userId}
                  className="border-t border-line bg-surface text-ink"
                >
                  <td className="px-2 py-2 text-right font-semibold text-accent-strong sm:px-3">
                    {i + 1}
                  </td>
                  <td className="px-2 py-2 font-medium sm:px-3">
                    <span className="block leading-tight">{row.displayName}</span>
                    <span className="block text-xs leading-tight text-ink-muted sm:hidden">
                      {row.picksMade} of {row.gamesAvailable} games
                      {seasonStarted && (
                        <>
                          {" "}
                          &middot; {row.correctPicks}/{row.totalPicks} right
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono sm:px-3">
                    {(row.pickedPct * 100).toFixed(1)}%
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {row.picksMade}
                    <span className="text-ink-muted">/{row.gamesAvailable}</span>
                  </td>
                  {seasonStarted && (
                    <>
                      <td className="px-2 py-2 text-right font-mono sm:px-3">
                        {row.totalPicks > 0
                          ? `${(row.correctPct * 100).toFixed(1)}%`
                          : "--"}
                      </td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">
                        {row.correctPicks}
                        <span className="text-ink-muted">/{row.totalPicks}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono sm:px-3">
                        {row.correctPicks > 0
                          ? `${(row.marginPct * 100).toFixed(1)}%`
                          : "--"}
                      </td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">
                        {row.correctMargins}
                        <span className="text-ink-muted">/{row.correctPicks}</span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
          Playoff picks
          <Tooltip text="Everyone's hand-picked 12-team field, the four teams they have reaching the semifinals, and their national champion. Once the real playoff field is known, 'Field' scores how many of their 12 actually made it -- that's purely about the teams, not about predicting exact matchups. Teams that really did make the field are highlighted." />
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {realField
            ? "Highlighted teams really did make the playoff field."
            : "Scoring appears here once the real playoff field is entered."}
        </p>
      </div>

      {playoffRows.length === 0 ? (
        <p className="text-ink-muted">
          No one has confirmed a 12-team field yet -- see the Bracket page.
        </p>
      ) : (
        <div className="space-y-3">
          {playoffRows.map((user) => (
            <div
              key={user.userId}
              className="rounded-lg border border-line bg-surface px-3 py-3"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold text-ink">{user.displayName}</span>
                {user.fieldCorrect !== null && (
                  <span className="text-sm text-ink-muted">
                    Field:{" "}
                    <span className="font-mono font-semibold text-win">
                      {user.fieldCorrect}
                    </span>
                    <span className="text-ink-muted">
                      /{user.teamIds.length} correct
                    </span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    Final Four
                  </span>
                  {user.finalFourTeamIds.length === 0 ? (
                    <span className="text-sm text-ink-muted">
                      Bracket not filled out that far yet.
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {user.finalFourTeamIds.map((id) =>
                        teamChip(id, realFieldSet.has(id)),
                      )}
                    </span>
                  )}
                </div>

                <div>
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    Champion
                  </span>
                  {user.championPickTeamId === null ? (
                    <span className="text-sm text-ink-muted">
                      No champion picked yet.
                    </span>
                  ) : (
                    teamChip(
                      user.championPickTeamId,
                      realFieldSet.has(user.championPickTeamId),
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
