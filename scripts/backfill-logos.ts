// Run once (and again if new opponents show up with no logo):
//   npm run backfill:logos
// Every team row already has cfbd_team_id set -- FBS teams via
// resolve-cfbd-team-ids.ts, and non-FBS opponents directly from the game
// payload's homeId/awayId at ingestion time (lib/ingest.ts). This just
// fetches every division's logo in one call and fills in logo_url for
// whichever of our rows don't have one yet, no name-matching needed.
import { sql } from "../lib/db";
import { fetchAllTeams, pickLogoUrl } from "../lib/cfbd";

const SEASON = 2026;

async function main() {
  const cfbdTeams = await fetchAllTeams(SEASON);
  const logoByCfbdId = new Map(
    cfbdTeams.map((t) => [t.id, pickLogoUrl(t.logos)]),
  );

  const ourTeams = await sql<{ id: number; cfbd_team_id: number | null }[]>`
    SELECT id, cfbd_team_id FROM teams WHERE cfbd_team_id IS NOT NULL AND logo_url IS NULL
  `;

  let updated = 0;
  for (const team of ourTeams) {
    const logoUrl = logoByCfbdId.get(team.cfbd_team_id!);
    if (!logoUrl) continue;
    await sql`UPDATE teams SET logo_url = ${logoUrl} WHERE id = ${team.id}`;
    updated++;
  }

  console.log(`Backfilled logos for ${updated} of ${ourTeams.length} teams missing one.`);

  const stillMissing = await sql<{ name: string }[]>`
    SELECT name FROM teams WHERE cfbd_team_id IS NOT NULL AND logo_url IS NULL ORDER BY name
  `;
  if (stillMissing.length > 0) {
    console.log(`\n${stillMissing.length} teams still have no logo (not found in CFBD's /teams response):`);
    stillMissing.forEach((t) => console.log(`  - ${t.name}`));
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
