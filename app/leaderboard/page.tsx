import { Tooltip } from "@/components/Tooltip";
import { sortLeaderboard } from "@/lib/leaderboard";
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
          <Tooltip text="Everyone who's signed in and made at least one prediction with a real result to compare against. Sorted by correct-pick percentage first, then by average margin error (lower is better) as the tiebreaker. Only first name + last initial are shown -- no one else's picks are visible, just these two stats." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Correct-winner percentage and average margin error, across every
          signed-in predictor -- updates daily as real results come in.
        </p>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-ink-muted">
          No completed games yet -- check back once the season is underway.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Correct</th>
                <th className="px-3 py-2 text-right">Picks</th>
                <th className="px-3 py-2 text-right">Correct %</th>
                <th className="px-3 py-2 text-right">Avg margin error</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={row.userId}
                  className="border-t border-line bg-surface text-ink"
                >
                  <td className="px-3 py-2 text-right font-semibold text-accent-strong">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.displayName}</td>
                  <td className="px-3 py-2 text-right">{row.correctPicks}</td>
                  <td className="px-3 py-2 text-right">{row.totalPicks}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(row.correctPct * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.avgMarginDiff !== null
                      ? row.avgMarginDiff.toFixed(1)
                      : "--"}
                  </td>
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
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Conf. bonus</th>
                <th className="px-3 py-2 text-right">Playoff bonus</th>
                <th className="px-3 py-2 text-left">Champion pick</th>
                <th className="px-3 py-2 text-right">Total bonus</th>
              </tr>
            </thead>
            <tbody>
              {bonusRows.map((row, i) => (
                <tr
                  key={row.userId}
                  className="border-t border-line bg-surface text-ink"
                >
                  <td className="px-3 py-2 text-right font-semibold text-accent-strong">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.displayName}</td>
                  <td className="px-3 py-2 text-right">
                    {row.conferencePoints}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.playoffPoints}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-win">
                    {row.championPickCorrect ? "Correct!" : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
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
