import { computeBracketSeeding, getBracketCandidates } from "@/lib/bracket";
import { computeComputerRankings } from "@/lib/computerRankings";
import { getAllGames, getAllTeams, getBracketField } from "@/lib/queries";
import { resetBracketFieldAction, setBracketFieldAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const [teams, games, selectedTeamIds] = await Promise.all([
    getAllTeams(),
    getAllGames(),
    getBracketField(),
  ]);
  const rankings = computeComputerRankings(teams, games);
  const candidates = getBracketCandidates(games, rankings);

  if (selectedTeamIds) {
    const bracket = computeBracketSeeding(selectedTeamIds, rankings);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">12-Team Playoff Bracket</h1>
          <form action={resetBracketFieldAction}>
            <button
              type="submit"
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Edit selection
            </button>
          </form>
        </div>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {bracket.seeds.map((s) => (
            <li
              key={s.teamId}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
            >
              <span className="font-semibold">#{s.seed}</span> {s.team}{" "}
              <span className="text-neutral-500">
                ({s.wins}-{s.losses}, {s.score.toFixed(2)})
              </span>
              {s.seed <= 4 && (
                <span className="ml-2 text-xs text-emerald-400">BYE</span>
              )}
            </li>
          ))}
        </ol>

        <div>
          <h2 className="mb-2 text-lg font-medium">Round 1</h2>
          <div className="space-y-2">
            {bracket.round1
              .filter((g) => g.lowerSeed !== null)
              .map((g) => {
                const higher = bracket.seeds.find((s) => s.seed === g.higherSeed);
                const lower = bracket.seeds.find((s) => s.seed === g.lowerSeed);
                return (
                  <div
                    key={g.higherSeed}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                  >
                    #{g.higherSeed} {higher?.team} vs #{g.lowerSeed} {lower?.team}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  const championIds = new Set(candidates.champions.map((c) => c.teamId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Select the 12-Team Field</h1>
        <p className="mt-1 text-neutral-400">
          Pick exactly 12 teams for the playoff. Conference champions
          (auto-bid eligible) are marked below; everyone else is ranked by
          Computer Ranking so you can choose your at-large teams. Seeding and
          Round 1 pairings are generated automatically once you confirm.
        </p>
      </div>

      {candidates.champions.length < 5 && (
        <p className="rounded border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
          Only {candidates.champions.length} of 9 conference championships are
          decided so far. You can still select a field, but you may want to
          finish predicting Championship Week first.
        </p>
      )}

      <form action={setBracketFieldAction} className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2 text-right">Rank</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-left">Conference</th>
                <th className="px-3 py-2 text-right">W</th>
                <th className="px-3 py-2 text-right">L</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-left">Champion</th>
              </tr>
            </thead>
            <tbody>
              {candidates.rankings.map((row) => (
                <tr
                  key={row.teamId}
                  className={
                    championIds.has(row.teamId) ? "bg-emerald-950/20" : undefined
                  }
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" name="teamIds" value={row.teamId} />
                  </td>
                  <td className="px-3 py-2 text-right">{row.rank}</td>
                  <td className="px-3 py-2">{row.team}</td>
                  <td className="px-3 py-2 text-neutral-400">
                    {row.conference}
                  </td>
                  <td className="px-3 py-2 text-right">{row.wins}</td>
                  <td className="px-3 py-2 text-right">{row.losses}</td>
                  <td className="px-3 py-2 text-right">
                    {row.score.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs text-emerald-400">
                    {row.isChampion ? "Champion" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          Confirm 12-Team Field
        </button>
      </form>
    </div>
  );
}
