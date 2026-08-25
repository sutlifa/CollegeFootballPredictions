// Applies lib/db/schema.sql against DATABASE_URL. Uses the `postgres`
// package directly rather than shelling out to `psql`, so it works without
// requiring a local Postgres client install.
import { sql } from "../lib/db";

async function main() {
  await sql.file(`${__dirname}/../lib/db/schema.sql`);
  console.log("Schema applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
