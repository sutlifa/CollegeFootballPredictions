import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { hasGradedResults, sortLeaderboard } from "@/lib/leaderboard";
import {
  getAllBracketPicks,
  getAllConferenceTitlePicks,
  getAllTeams,
  getLeaderboard,
  getRealConferenceResults,
  getRealNationalChampion,
  getRealPlayoffRounds,
} from "@/lib/queries";
import { scoreSeason, SEASON_POINTS } from "@/lib/seasonScore";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [
    rows,
    bracketPicksByUser,
    realPlayoffRounds,
    teams,
    conferencePicksByUser,
    realConferenceResults,
    realNationalChampionTeamId,
  ] = await Promise.all([
    getLeaderboard(),
    getAllBracketPicks(),
    getRealPlayoffRounds(),
    getAllTeams(),
    getAllConferenceTitlePicks(),
    getRealConferenceResults(),
    getRealNationalChampion(),
  ]);
  const sortedRows = sortLeaderboard(rows);
  // Before any real result exists there is nothing to be "correct" about, so
  // the scoring columns would just be a wall of 0.0% -- the board shows how
  // far along everyone's picks are instead until the first game is graded.
  const seasonStarted = hasGradedResults(rows);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const realField = realPlayoffRounds.field ?? null;
  const realFieldSet = new Set(realField ?? []);

  // The season total: one number per person, from the four things they were
  // actually asked to predict. Only shown once some real result exists to
  // score against -- before that it would be a column of zeroes.
  const conferencePicksById = new Map(
    conferencePicksByUser.map((u) => [u.userId, u.picks]),
  );
  const bracketById = new Map(bracketPicksByUser.map((u) => [u.userId, u]));
  const seasonScores = scoreSeason(
    rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      correctWinners: row.correctPicks,
      correctMargins: row.correctMargins,
      conferencePicks: conferencePicksById.get(row.userId) ?? [],
      playoffTeamIds: bracketById.get(row.userId)?.teamIds ?? [],
      championPickTeamId: bracketById.get(row.userId)?.championPickTeamId ?? null,
    })),
    {
      realChampionByConference: new Map(
        realConferenceResults.map((r) => [r.conference, r.championTeamId]),
      ),
      realPlayoffField: realField,
      realNationalChampionTeamId,
    },
  );
  const anySeasonPoints = seasonScores.some((s) => s.total > 0);

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
          <Tooltip text="Everyone who's signed in, ranked by Winners and then by Margins. Each percentage is followed by the raw count it came from -- and all three divide by something different, so the definitions are spelled out under the table. Only first name + last initial are shown; no one else's picks are visible." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {seasonStarted
            ? "Correct winners and margin accuracy across every signed-in predictor -- updates daily as real results come in."
            : "The season hasn't started, so there's nothing to score yet -- this shows how far along everyone's picks are. Winner and margin standings take over once real results start coming in."}
        </p>
      </div>

      {anySeasonPoints && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            Season score
            <Tooltip
              text={`One total from the four things you predict. A correct winner is ${SEASON_POINTS.correctWinner} point and the right margin bucket on top of it another ${SEASON_POINTS.correctMargin}. Naming a conference champion is worth ${SEASON_POINTS.conferenceChampion} and each of your 12 that actually makes the playoff field ${SEASON_POINTS.playoffFieldTeam}, because there are only nine and twelve of those to get -- without that weighting, hundreds of regular season games would drown the postseason out entirely. Calling the national champion is worth ${SEASON_POINTS.nationalChampion}.`}
            />
          </h2>
          <p className="text-sm text-ink-muted">
            The percentages below say how accurate you are. This says who is
            winning.
          </p>
          <div className="rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-muted">
                <tr>
                  <th className="px-2 py-2 text-right sm:px-3">#</th>
                  <th className="px-2 py-2 text-left sm:px-3">Name</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Games</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Margins</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Conf titles</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Playoff field</th>
                  <th className="px-2 py-2 text-right sm:px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {seasonScores.map((s, i) => (
                  <tr
                    key={s.userId}
                    className="border-t border-line bg-surface text-ink"
                  >
                    <td className="px-2 py-2 text-right font-semibold text-accent-strong sm:px-3">
                      {i + 1}
                    </td>
                    <td className="px-2 py-2 font-medium sm:px-3">
                      <span className="block leading-tight">
                        {s.displayName}
                        {s.nationalChampionCorrect && (
                          <span className="ml-1.5 text-xs font-semibold text-win">
                            🏆 champion
                          </span>
                        )}
                      </span>
                      <span className="block text-xs leading-tight text-ink-muted sm:hidden">
                        {s.gamePoints} games &middot; {s.marginPoints} margins
                        &middot; {s.conferencePoints} titles &middot;{" "}
                        {s.playoffPoints} playoff
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell">
                      {s.gamePoints}
                      <span className="text-ink-muted"> ({s.correctWinners})</span>
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell">
                      {s.marginPoints}
                      <span className="text-ink-muted"> ({s.correctMargins})</span>
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell">
                      {s.conferencePoints}
                      <span className="text-ink-muted">
                        {" "}
                        ({s.conferenceChampions}/{s.conferenceChampionsPossible})
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell">
                      {s.playoffPoints}
                      <span className="text-ink-muted">
                        {" "}
                        ({s.playoffFieldTeams}/{s.playoffFieldPossible})
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold text-accent-strong sm:px-3">
                      {s.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                {/* Each percentage is followed by the raw fraction it came
                    from, named after the same thing, because all three have
                    DIFFERENT denominators -- see the note under the table. */}
                <th
                  className="px-2 py-2 text-right sm:px-3"
                  title="Share of your schedule you've entered a pick for"
                >
                  Picked
                </th>
                <th
                  className="hidden px-3 py-2 text-right sm:table-cell"
                  title="Picks entered out of games on your schedule"
                >
                  Picks made
                </th>
                {seasonStarted && (
                  <>
                    <th
                      className="px-2 py-2 text-right sm:px-3"
                      title="Share of your played games where you had the right team"
                    >
                      Winners
                    </th>
                    <th
                      className="hidden px-3 py-2 text-right sm:table-cell"
                      title="Right team out of your games that have been played"
                    >
                      Winners hit
                    </th>
                    <th
                      className="px-2 py-2 text-right sm:px-3"
                      title="Of the games you got the winner right, how often the margin landed too"
                    >
                      Margins
                    </th>
                    <th
                      className="hidden px-3 py-2 text-right sm:table-cell"
                      title="Right margin out of the games you got the winner right"
                    >
                      Margins hit
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
                      {/* Only the raw count that matters for the current phase --
                          all three percentages are already visible as their own
                          columns here, so listing every fraction just wrapped
                          the name cell onto four lines. */}
                      {seasonStarted ? (
                        <>
                          {row.correctPicks}/{row.totalPicks} winners
                        </>
                      ) : (
                        <>
                          {row.picksMade}/{row.gamesAvailable} picked
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

      {sortedRows.length > 0 && (
        /* The three percentages each divide by something different, which is
           the genuinely confusing part -- so spell the denominators out
           rather than leaving people to infer them from the headers. */
        <dl className="grid gap-x-6 gap-y-2 text-xs text-ink-muted sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-ink-soft">Picked</dt>
            <dd className="m-0">
              Picks entered, out of every game on your schedule. Your own Week
              16 championship matchups count toward that total, so it can
              differ slightly between people.
            </dd>
          </div>
          {seasonStarted && (
            <>
              <div>
                <dt className="font-semibold text-ink-soft">Winners</dt>
                <dd className="m-0">
                  Games where you had the right team, out of your picks that
                  have actually been played. Games still to come don&apos;t
                  count against you.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-soft">Margins</dt>
                <dd className="m-0">
                  How often the margin bucket landed too (1-7, 8-14, 15-21,
                  22+) — out of the games you already got the winner right,
                  since the margin is moot on a game you picked backwards.
                </dd>
              </div>
            </>
          )}
        </dl>
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
