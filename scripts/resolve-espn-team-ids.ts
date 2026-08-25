// Run once (and again any time ESPN's team list or ours changes):
//   npm run seed:espn-ids
// Matches ESPN teams against our teams.name by trying, in order: an explicit
// alias, then ESPN's `location`, `shortDisplayName`, and `displayName`
// fields. Never fuzzy-matches -- unresolved names are printed so a human can
// add an alias and re-run.
import { sql } from "../lib/db";
import { fetchAllEspnTeams, type EspnTeam } from "../lib/espn";
import aliasesJson from "../lib/data/team-name-aliases.json";

const aliases: Record<string, string> = Object.fromEntries(
  Object.entries(aliasesJson).filter(([key]) => key !== "_comment"),
);

function candidateNames(team: EspnTeam): string[] {
  const names = [team.location, team.shortDisplayName, team.displayName];
  const aliased = names.map((n) => aliases[n]).filter((n): n is string => !!n);
  return [...aliased, ...names];
}

async function main() {
  const espnTeams = await fetchAllEspnTeams();
  const ourTeams = await sql<
    { id: number; name: string; espn_team_id: number | null }[]
  >`SELECT id, name, espn_team_id FROM teams`;
  const ourTeamByName = new Map(ourTeams.map((t) => [t.name, t]));

  const unresolved: string[] = [];
  let matched = 0;

  for (const espnTeam of espnTeams) {
    const ourTeam = candidateNames(espnTeam)
      .map((name) => ourTeamByName.get(name))
      .find((t) => t !== undefined);
    if (!ourTeam) {
      unresolved.push(espnTeam.displayName);
      continue;
    }
    await sql`
      UPDATE teams SET espn_team_id = ${Number(espnTeam.id)} WHERE id = ${ourTeam.id}
    `;
    matched++;
  }

  console.log(`Matched ${matched} of ${espnTeams.length} ESPN teams.`);

  const stillMissing = await sql<{ name: string }[]>`
    SELECT name FROM teams WHERE is_fbs AND espn_team_id IS NULL ORDER BY name
  `;
  if (stillMissing.length > 0) {
    console.log(
      `\n${stillMissing.length} FBS teams still have no espn_team_id:`,
    );
    stillMissing.forEach((t) => console.log(`  - ${t.name}`));
    console.log(
      "\nFor each, find its ESPN entry and add {\"<espn location or shortDisplayName>\": \"<our name>\"} to lib/data/team-name-aliases.json, then re-run.",
    );
  }

  await sql.end();
  if (stillMissing.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
