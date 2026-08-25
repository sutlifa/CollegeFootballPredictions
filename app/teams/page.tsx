import { TeamLogo } from "@/components/TeamLogo";
import { getAllTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await getAllTeams();
  const fbsTeams = teams
    .filter((t) => t.isFbs)
    .sort((a, b) => a.conference.localeCompare(b.conference) || a.name.localeCompare(b.name));

  const grouped = new Map<string, typeof fbsTeams>();
  for (const team of fbsTeams) {
    const list = grouped.get(team.conference) ?? [];
    list.push(team);
    grouped.set(team.conference, list);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-ink">Teams</h1>
      {Array.from(grouped.entries()).map(([conference, list]) => (
        <section key={conference}>
          <h2 className="mb-2 text-lg font-semibold text-accent-strong">{conference}</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
            {list.map((team) => (
              <div key={team.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <TeamLogo logoUrl={team.logoUrl} name={team.name} size={20} />
                <span>
                  {team.name}
                  {team.preseasonRank && (
                    <span className="ml-1 text-ink-muted">
                      #{team.preseasonRank}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
