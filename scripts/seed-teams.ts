// Run once against a fresh database: npm run seed:teams
import { sql } from "../lib/db";
import teamsSeed from "../lib/data/teams-seed.json";

async function main() {
  let inserted = 0;
  for (const team of teamsSeed as {
    name: string;
    conference: string;
    preseasonRank: number | null;
  }[]) {
    await sql`
      INSERT INTO teams (name, conference, preseason_rank, is_fbs)
      VALUES (${team.name}, ${team.conference}, ${team.preseasonRank}, TRUE)
      ON CONFLICT (name) DO UPDATE
        SET conference = EXCLUDED.conference,
            preseason_rank = EXCLUDED.preseason_rank
    `;
    inserted++;
  }
  console.log(`Seeded/updated ${inserted} FBS teams.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
