import { Tooltip } from "@/components/Tooltip";
import { hasGradedResults, sortLeaderboard } from "@/lib/leaderboard";
import {
  getAllBracketPicks,
  getAllConferenceTitlePicks,
  getLeaderboard,
  getRealConferenceResults,
  getRealNationalChampion,
  getRealPlayoffRounds,
} from "@/lib/queries";
import { scoreConferenceTitleBonus, scorePlayoffBonus } from "@/lib/postseasonBonus";

export const dynamic = "force-dynamic";

type BonusRow = {
  userId: number;
  displayName: string;
  conferencePoints: number;
  playoffPoints: number;
  championPickCorrect: boolean;
  totalPoints: number;
};

export default async function LeaderboardPage() {
  const [
    rows,
    conferencePicksByUser,
    bracketPicksByUser,
    realConferenceResults,
    realPlayoffRounds,
    realNationalChampionTeamId,
  ] = await Promise.all([
    getLeaderboard(),
    getAllConferenceTitlePicks(),
    getAllBracketPicks(),
    getRealConferenceResults(),
    getRealPlayoffRounds(),
    getRealNationalChampion(),
  ]);
  const sortedRows = sortLeaderboard(rows);
  // Before any real result exists there is nothing to be "correct" about, so
  // the scoring columns would just be a wall of 0.0% -- the board shows how
  // far along everyone's picks are instead until the first game is graded.
  const seasonStarted = hasGradedResults(rows);

  const hasBonusData =
    realConferenceResults.length > 0 ||
    Object.keys(realPlayoffRounds).length > 0 ||
    realNationalChampionTeamId !== null;

  const bonusByUser = new Map<number, BonusRow>();
  const getOrInit = (userId: number, displayName: string): BonusRow => {
    let row = bonusByUser.get(userId);
    if (!row) {
      row = {
        userId,
        displayName,
        conferencePoints: 0,
        playoffPoints: 0,
        championPickCorrect: false,
        totalPoints: 0,
      };
      bonusByUser.set(userId, row);
    }
    return row;
  };

  for (const user of conferencePicksByUser) {
    const conferenceBonus = scoreConferenceTitleBonus(
      user.picks,
      realConferenceResults,
    );
    const points = conferenceBonus.reduce((sum, r) => sum + r.points, 0);
    if (points === 0) continue;
    const row = getOrInit(user.userId, user.displayName);
    row.conferencePoints += points;
    row.totalPoints += points;
  }

  for (const user of bracketPicksByUser) {
    const playoffBonus = scorePlayoffBonus(
      user.teamIds,
      user.championPickTeamId,
      realPlayoffRounds,
      realNationalChampionTeamId,
    );
    if (playoffBonus.totalPoints === 0) continue;
    const row = getOrInit(user.userId, user.displayName);
    row.playoffPoints += playoffBonus.totalPoints;
    row.championPickCorrect = playoffBonus.championPickCorrect;
    row.totalPoints += playoffBonus.totalPoints;
  }

  const bonusRows = Array.from(bonusByUser.values()).sort(
    (a, b) => b.totalPoints - a.totalPoints,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Leaderboard
          <Tooltip text="Everyone who's signed in. Picked shows how much of your slate you've filled in (your own Week 16 championship games count toward your total, so the denominator can differ slightly between people). Once real results start coming in, everyone with games to be scored on moves to the top, sorted by correct-pick percentage and then by average margin error (lower is better) as the tiebreaker. Only first name + last initial are shown -- no one else's picks are visible, just these stats." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {seasonStarted
            ? "Correct-winner percentage and average margin error, across every signed-in predictor -- updates daily as real results come in."
            : "The season hasn't started, so there's nothing to score yet -- this shows how far along everyone's picks are. Correct-pick standings take over once real results start coming in."}
        </p>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-ink-muted">
          No one has signed in yet.
        </p>
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
                    <th className="px-2 py-2 text-right sm:px-3">Correct</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">
                      Scored
                    </th>
                    <th className="px-2 py-2 text-right sm:px-3">Correct %</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">
                      Avg margin error
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
                          &middot; avg margin err{" "}
                          {row.avgMarginDiff !== null
                            ? row.avgMarginDiff.toFixed(1)
                            : "--"}
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
                      <td className="px-2 py-2 text-right sm:px-3">
                        {row.correctPicks}
                        <span className="text-ink-muted sm:hidden">
                          /{row.totalPicks}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">
                        {row.totalPicks}
                      </td>
                      <td className="px-2 py-2 text-right font-mono sm:px-3">
                        {row.totalPicks > 0
                          ? `${(row.correctPct * 100).toFixed(1)}%`
                          : "--"}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono sm:table-cell">
                        {row.avgMarginDiff !== null
                          ? row.avgMarginDiff.toFixed(1)
                          : "--"}
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
          Postseason bonus
          <Tooltip text="Extra points on top of the running leaderboard, once real conference championship and playoff results are known. Conference titles: +5 for picking both real finalists, +10 more for picking the real winner (per conference). Playoffs: points for each of your 12 picks still alive at each checkpoint (Round of 12/8/4/2), weighted higher for surviving further, plus a big bonus for correctly picking the national champion." />
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Only appears once conference championships and/or the playoff are
          decided -- nothing to show yet during the regular season.
        </p>
      </div>

      {!hasBonusData ? (
        <p className="text-ink-muted">
          Not available yet -- checks back in once conference championships
          and the playoff are decided.
        </p>
      ) : bonusRows.length === 0 ? (
        <p className="text-ink-muted">
          Results are in, but no one has any bonus points yet.
        </p>
      ) : (
        /* Phones keep only rank / name / total; the conference and playoff
           splits move under the name so the row still fits. */
        <div className="rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-right sm:px-3">#</th>
                <th className="px-2 py-2 text-left sm:px-3">Name</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">
                  Conf. bonus
                </th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">
                  Playoff bonus
                </th>
                <th className="hidden px-3 py-2 text-left sm:table-cell">
                  Champion pick
                </th>
                <th className="px-2 py-2 text-right sm:px-3">Total bonus</th>
              </tr>
            </thead>
            <tbody>
              {bonusRows.map((row, i) => (
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
                      conf {row.conferencePoints} &middot; playoff{" "}
                      {row.playoffPoints}
                      {row.championPickCorrect && (
                        <span className="font-semibold text-win">
                          {" "}
                          &middot; champion correct!
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {row.conferencePoints}
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {row.playoffPoints}
                  </td>
                  <td className="hidden px-3 py-2 text-xs font-semibold text-win sm:table-cell">
                    {row.championPickCorrect ? "Correct!" : ""}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold sm:px-3">
                    {row.totalPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
