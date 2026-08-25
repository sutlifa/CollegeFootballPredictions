import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { CHAMPIONSHIP_CONFERENCES } from "@/lib/conferences";
import { getAllGames, getAllTeams } from "@/lib/queries";
import { computeStandings, groupStandingsByConference } from "@/lib/standings";
import { isDecided } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const session = await auth();
  const [teams, games] = await Promise.all([
    getAllTeams(),
    getAllGames(session!.user.id),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const standings = computeStandings(teams, games);
  const grouped = groupStandingsByConference(standings);

  const week16Games = games.filter((g) => g.week === 16);
  const championByConference = new Map<string, string>();
  for (const game of week16Games) {
    if (!game.conference || !isDecided(game)) continue;
    const winnerId =
      game.predictedScoreTeam1 > game.predictedScoreTeam2
        ? game.team1Id
        : game.team2Id;
    const winner = teams.find((t) => t.id === winnerId);
    if (winner) championByConference.set(game.conference, winner.name);
  }

  const conferences = Array.from(grouped.keys()).sort();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Standings
          <Tooltip text="Grouped by conference and sorted by conference record first, then overall record. Each conference's top two (highlighted) play each other in that conference's Week 16 championship -- the winner becomes conference champion and locks an automatic bid into the Bracket." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Based on your own predictions for weeks 1-15 -- updates live as you save each one, no submission required.
        </p>
      </div>
      {conferences.map((conference) => {
        const rows = grouped.get(conference)!;
        const isChampionshipConf = (
          CHAMPIONSHIP_CONFERENCES as readonly string[]
        ).includes(conference);
        const champion = championByConference.get(conference);
        return (
          <section key={conference}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-ink">{conference}</h2>
              {champion ? (
                <span className="text-sm font-medium text-win">
                  Champion: {champion}
                </span>
              ) : isChampionshipConf && rows.length >= 2 ? (
                <span className="text-sm text-ink-muted">
                  Championship: {rows[0].team} vs {rows[1].team}
                </span>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-right">#</th>
                    <th className="px-3 py-2 text-left">Team</th>
                    <th className="px-3 py-2 text-right">W</th>
                    <th className="px-3 py-2 text-right">L</th>
                    <th className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 normal-case">
                        Conf W
                        <Tooltip text="Wins/losses against other teams in this same conference only -- the tiebreaker used to seed the conference championship, ranked above overall record." />
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right">Conf L</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.teamId}
                      className={`border-t border-line bg-surface ${
                        i < 2 && isChampionshipConf ? "bg-surface-2" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-right font-semibold text-accent-strong">
                        {i + 1}
                      </td>
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
                      <td className="px-3 py-2 text-right">{row.wins}</td>
                      <td className="px-3 py-2 text-right">{row.losses}</td>
                      <td className="px-3 py-2 text-right">{row.confWins}</td>
                      <td className="px-3 py-2 text-right">
                        {row.confLosses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
