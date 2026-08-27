import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { POWER_CONFERENCES } from "@/lib/bracket";
import {
  CHAMPIONSHIP_CONFERENCES,
  SUN_BELT_DIVISIONS,
} from "@/lib/conferences";
import { getAllGames, getAllTeams } from "@/lib/queries";
import { computeStandings, groupStandingsByConference } from "@/lib/standings";
import {
  resolveConferenceStandingsWithTiebreakers,
  resolveSunBeltDivisionStandings,
} from "@/lib/tiebreakerRules";
import type { StandingsRow } from "@/lib/types";
import { isDecided } from "@/lib/types";

export const dynamic = "force-dynamic";

function StandingsTable({
  rows,
  teamById,
  highlightTop,
}: {
  rows: StandingsRow[];
  teamById: Map<number, { logoUrl: string | null }>;
  highlightTop: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-right">#</th>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-3 py-2 text-right">W</th>
            <th className="px-3 py-2 text-right">L</th>
            <th className="px-3 py-2 text-right">Conf W</th>
            <th className="px-3 py-2 text-right">Conf L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.teamId}
              className={`border-t border-line bg-surface ${
                i < highlightTop ? "bg-surface-2" : ""
              }`}
            >
              <td className="px-3 py-2 text-right font-semibold text-accent-strong">
                {i + 1}
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <TeamLogo
                    logoUrl={teamById.get(row.teamId)?.logoUrl ?? null}
                    name={row.team}
                    size={20}
                  />
                  {row.team}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{row.wins}</td>
              <td className="px-3 py-2 text-right">{row.losses}</td>
              <td className="px-3 py-2 text-right">{row.confWins}</td>
              <td className="px-3 py-2 text-right">{row.confLosses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
          <Tooltip text="Grouped by conference and sorted by Conf W/L (record against other teams in the same conference only) first, then overall record. For the 9 conferences with a championship game, a tie is broken using that conference's own real tiebreaker procedure (head-to-head, common opponents, etc.) instead of the general record/preseason-rank/name order used everywhere else. Each conference's top two (highlighted) play each other in that conference's Week 16 championship -- except the Sun Belt, still split into East/West divisions, where the division champs (each division's own #1, highlighted) play each other instead. For the ACC, Big 12, Big Ten, and SEC, winning locks an automatic playoff bid no matter how the team is ranked. For every other conference, winning the title does NOT by itself guarantee a bid -- only one Group of Six team gets an automatic bid (the highest-ranked one, champion or not). See the Bracket page for the full breakdown." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Based on your own predictions for weeks 1-15 -- updates live as you save each one, no submission required.
        </p>
      </div>
      {conferences.map((conference) => {
        const isChampionshipConf = (
          CHAMPIONSHIP_CONFERENCES as readonly string[]
        ).includes(conference);
        const isPowerConf = (POWER_CONFERENCES as readonly string[]).includes(
          conference,
        );
        const champion = championByConference.get(conference);

        if (conference === "Sun Belt") {
          const divisions = Object.keys(SUN_BELT_DIVISIONS) as ("East" | "West")[];
          const divisionRows = divisions.map((division) => ({
            division,
            rows: resolveSunBeltDivisionStandings(teams, games, division),
          }));
          return (
            <section key={conference} className="space-y-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-semibold text-ink">{conference}</h2>
                {champion ? (
                  <span className="text-sm font-medium text-win">
                    Champion: {champion}
                    <span className="ml-1 font-normal text-ink-muted">
                      (not an automatic bid by itself -- see Bracket)
                    </span>
                  </span>
                ) : divisionRows.every((d) => d.rows.length >= 1) ? (
                  <span className="text-sm text-ink-muted">
                    Championship: {divisionRows[0].rows[0].team} (East) vs{" "}
                    {divisionRows[1].rows[0].team} (West)
                  </span>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {divisionRows.map(({ division, rows: divRows }) => (
                  <div key={division}>
                    <h3 className="mb-2 text-sm font-semibold text-ink-muted">
                      {division}
                    </h3>
                    <StandingsTable
                      rows={divRows}
                      teamById={teamById}
                      highlightTop={1}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        }

        const rows = isChampionshipConf
          ? resolveConferenceStandingsWithTiebreakers(teams, games, conference)
          : grouped.get(conference)!;

        return (
          <section key={conference}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-ink">{conference}</h2>
              {champion ? (
                <span className="text-sm font-medium text-win">
                  Champion: {champion}
                  {isPowerConf ? (
                    <span className="ml-1 font-normal text-ink-muted">
                      (automatic bid)
                    </span>
                  ) : (
                    <span className="ml-1 font-normal text-ink-muted">
                      (not an automatic bid by itself -- see Bracket)
                    </span>
                  )}
                </span>
              ) : isChampionshipConf && rows.length >= 2 ? (
                <span className="text-sm text-ink-muted">
                  Championship: {rows[0].team} vs {rows[1].team}
                </span>
              ) : null}
            </div>
            <StandingsTable
              rows={rows}
              teamById={teamById}
              highlightTop={isChampionshipConf ? 2 : 0}
            />
          </section>
        );
      })}
    </div>
  );
}
