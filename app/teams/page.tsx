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
      <h1 className="text-2xl font-semibold">Teams</h1>
      {Array.from(grouped.entries()).map(([conference, list]) => (
        <section key={conference}>
          <h2 className="mb-2 text-lg font-medium">{conference}</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
            {list.map((team) => (
              <div key={team.id} className="text-sm text-neutral-300">
                {team.name}
                {team.preseasonRank && (
                  <span className="ml-1 text-neutral-500">
                    #{team.preseasonRank}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
