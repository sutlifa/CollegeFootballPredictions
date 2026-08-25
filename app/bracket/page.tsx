import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { TrophyIcon } from "@/components/TrophyIcon";
import { computeBracketSeeding, getBracketCandidates } from "@/lib/bracket";
import { computeComputerRankings } from "@/lib/computerRankings";
import {
  getAllGames,
  getAllTeams,
  getBracketField,
  getSubmittedWeeks,
} from "@/lib/queries";
import { resetBracketFieldAction, setBracketFieldAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [teams, games, selectedTeamIds, submittedWeeks] = await Promise.all([
    getAllTeams(),
    getAllGames(userId),
    getBracketField(userId),
    getSubmittedWeeks(userId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Conference champions come from the real (predicted) Week 16 results
  // regardless of submission status -- only the Computer Ranking score
  // itself is gated behind "Submit Week Results".
  const submitted = new Set(submittedWeeks);
  const rankings = computeComputerRankings(
    teams,
    games.filter((g) => submitted.has(g.week)),
  );
  const candidates = getBracketCandidates(games, rankings);

  if (selectedTeamIds) {
    const bracket = computeBracketSeeding(selectedTeamIds, rankings);
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <TrophyIcon size={88} />
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
            12-Team Playoff Bracket
            <Tooltip text="Seeded 1-12 by Computer Ranking among your chosen field. Seeds 1-4 get a first-round bye. Round 1 is the standard 5v12, 6v11, 7v10, 8v9." />
          </h1>
        </div>
        <div className="flex items-center justify-end">
          <form action={resetBracketFieldAction}>
            <button
              type="submit"
              className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
            >
              Edit selection
            </button>
          </form>
        </div>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {bracket.seeds.map((s) => (
            <li
              key={s.teamId}
              className="rounded-lg border border-line bg-surface p-3 text-ink"
            >
              <span className="font-bold text-accent-strong">#{s.seed}</span>{" "}
              <span className="inline-flex items-center gap-2">
                <TeamLogo logoUrl={teamById.get(s.teamId)?.logoUrl} name={s.team} size={20} />
                {s.team}
              </span>{" "}
              <span className="text-ink-muted">
                ({s.wins}-{s.losses}, {s.score.toFixed(1)} rating)
              </span>
              {s.seed <= 4 && (
                <span
                  className="ml-2 rounded bg-win/20 px-1.5 py-0.5 text-xs font-bold text-win"
                  title="Top 4 seeds skip Round 1 and enter in the quarterfinals"
                >
                  BYE
                </span>
              )}
            </li>
          ))}
        </ol>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-ink">Round 1</h2>
          <div className="space-y-2">
            {bracket.round1
              .filter((g) => g.lowerSeed !== null)
              .map((g) => {
                const higher = bracket.seeds.find((s) => s.seed === g.higherSeed);
                const lower = bracket.seeds.find((s) => s.seed === g.lowerSeed);
                return (
                  <div
                    key={g.higherSeed}
                    className="rounded-lg border border-line bg-surface p-3 text-ink"
                  >
                    <span className="inline-flex items-center gap-2">
                      #{g.higherSeed}
                      <TeamLogo logoUrl={teamById.get(higher?.teamId ?? -1)?.logoUrl} name={higher?.team ?? ""} size={20} />
                      {higher?.team}
                    </span>{" "}
                    <span className="text-ink-muted">vs</span>{" "}
                    <span className="inline-flex items-center gap-2">
                      #{g.lowerSeed}
                      <TeamLogo logoUrl={teamById.get(lower?.teamId ?? -1)?.logoUrl} name={lower?.team ?? ""} size={20} />
                      {lower?.team}
                    </span>
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
      <div className="flex flex-col items-center gap-2 text-center">
        <TrophyIcon size={88} />
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Select the 12-Team Field
          <Tooltip text="Nothing is auto-selected. Check exactly 12 teams: conference champions are the traditional automatic bids, and the rest are your at-large picks -- use the Rank/Rating columns as a guide, but the final call is yours." />
        </h1>
        <p className="max-w-xl text-ink-muted">
          Pick exactly 12 teams for the playoff. Conference champions
          (auto-bid eligible) are marked below; everyone else is ranked by
          Computer Ranking so you can choose your at-large teams. Seeding and
          Round 1 pairings are generated automatically once you confirm.
        </p>
      </div>

      {candidates.champions.length < 5 && (
        <p className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-strong">
          Only {candidates.champions.length} of 9 conference championships are
          decided so far. You can still select a field, but you may want to
          finish predicting Championship Week first.
        </p>
      )}

      <form action={setBracketFieldAction} className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2 text-right">Rank</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-left">Conference</th>
                <th className="px-3 py-2 text-right">W</th>
                <th className="px-3 py-2 text-right">L</th>
                <th className="px-3 py-2 text-right">Rating</th>
                <th className="px-3 py-2 text-left">Champion</th>
              </tr>
            </thead>
            <tbody>
              {candidates.rankings.map((row) => (
                <tr
                  key={row.teamId}
                  className={`border-t border-line ${
                    championIds.has(row.teamId) ? "bg-win/10" : "bg-surface"
                  }`}
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" name="teamIds" value={row.teamId} />
                  </td>
                  <td className="px-3 py-2 text-right text-ink">{row.rank}</td>
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
                  <td className="px-3 py-2 text-right text-ink">{row.wins}</td>
                  <td className="px-3 py-2 text-right text-ink">{row.losses}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {row.score.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-win">
                    {row.isChampion ? "Champion" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
        >
          Confirm 12-Team Field
        </button>
      </form>
    </div>
  );
}
