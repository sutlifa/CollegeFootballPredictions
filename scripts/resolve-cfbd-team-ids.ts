// Run once (and again any time CFBD's team list or ours changes):
//   npm run seed:cfbd-ids
// Matches CFBD teams against our teams.name by trying, in order: an explicit
// alias, the team's `school` field, then its `alternateNames`. Never
// fuzzy-matches -- unresolved names are printed so a human can add an alias
// and re-run.
import { sql } from "../lib/db";
import { fetchFbsTeams, pickLogoUrl, type CfbdTeam } from "../lib/cfbd";
import aliasesJson from "../lib/data/team-name-aliases.json";

const aliases: Record<string, string> = Object.fromEntries(
  Object.entries(aliasesJson).filter(([key]) => key !== "_comment"),
);

function candidateNames(team: CfbdTeam): string[] {
  const names = [team.school, ...(team.alternateNames ?? [])];
  const aliased = names.map((n) => aliases[n]).filter((n): n is string => !!n);
  return [...aliased, ...names];
}

const SEASON = 2026;

async function main() {
  const cfbdTeams = await fetchFbsTeams(SEASON);
  const ourTeams = await sql<
    { id: number; name: string; cfbd_team_id: number | null }[]
  >`SELECT id, name, cfbd_team_id FROM teams`;
  const ourTeamByName = new Map(ourTeams.map((t) => [t.name, t]));

  const unresolved: string[] = [];
  let matched = 0;

  for (const cfbdTeam of cfbdTeams) {
    const ourTeam = candidateNames(cfbdTeam)
      .map((name) => ourTeamByName.get(name))
      .find((t) => t !== undefined);
    if (!ourTeam) {
      unresolved.push(cfbdTeam.school);
      continue;
    }
    await sql`
      UPDATE teams SET cfbd_team_id = ${cfbdTeam.id}, logo_url = ${pickLogoUrl(cfbdTeam.logos)}
      WHERE id = ${ourTeam.id}
    `;
    matched++;
  }

  console.log(`Matched ${matched} of ${cfbdTeams.length} CFBD FBS teams.`);

  const stillMissing = await sql<{ name: string }[]>`
    SELECT name FROM teams WHERE is_fbs AND cfbd_team_id IS NULL ORDER BY name
  `;
  if (stillMissing.length > 0) {
    console.log(
      `\n${stillMissing.length} FBS teams still have no cfbd_team_id:`,
    );
    stillMissing.forEach((t) => console.log(`  - ${t.name}`));
    console.log(
      '\nFor each, find its CFBD entry (school or alternateNames field) and add {"<cfbd name>": "<our name>"} to lib/data/team-name-aliases.json, then re-run.',
    );
  }
  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} CFBD FBS teams didn't match any of ours (informational -- shouldn't happen since this endpoint is FBS-only):`,
    );
    unresolved.forEach((n) => console.log(`  - ${n}`));
  }

  await sql.end();
  if (stillMissing.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
