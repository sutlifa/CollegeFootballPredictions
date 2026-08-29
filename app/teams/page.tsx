import Link from "next/link";
import { TeamLogo } from "@/components/TeamLogo";
import { getAllTeams } from "@/lib/queries";
import { displayTeamName } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = (await getAllTeams()).filter((t) => t.isFbs);

  const byConference = new Map<string, typeof teams>();
  for (const team of teams) {
    const list = byConference.get(team.conference) ?? [];
    list.push(team);
    byConference.set(team.conference, list);
  }
  const conferences = [...byConference.keys()].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Teams</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Open a team to see its whole season on one page -- every game from
          week 0 through the conference championship, your pick on each, and
          the real result once it is played. You can pick from there too.
        </p>
      </div>

      {conferences.map((conference) => {
        const members = byConference
          .get(conference)!
          .slice()
          .sort((a, b) => displayTeamName(a).localeCompare(displayTeamName(b)));
        return (
          <div key={conference}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {conference}{" "}
              <span className="font-normal normal-case">
                ({members.length})
              </span>
            </h2>
            {/* Two columns on a phone, up to four on a desktop -- 138 teams
                in one column is a very long scroll. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {members.map((team) => (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink hover:border-accent hover:text-accent-strong"
                >
                  <TeamLogo
                    logoUrl={team.logoUrl}
                    name={team.name}
                    size={20}
                  />
                  <span className="truncate">{displayTeamName(team)}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
