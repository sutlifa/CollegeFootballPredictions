// One-off: fills mascot/color/alt_color on teams that predate those columns.
// Matches on cfbd_team_id only -- never on name -- so it cannot smear one
// school's colours onto another. Leaves any team CFBD has no record for
// (the auto-created non-FBS opponents) untouched and reports the count.
import { sql } from "../lib/db.ts";
import { fetchAllTeams } from "../lib/cfbd.ts";

const cfbd = await fetchAllTeams(2025);
const byId = new Map(cfbd.map((t) => [t.id, t]));
const rows = await sql`SELECT id, cfbd_team_id, name FROM teams ORDER BY name`;

let updated = 0;
const unmatched = [];
for (const row of rows) {
  const t = row.cfbd_team_id === null ? undefined : byId.get(row.cfbd_team_id);
  if (!t) { unmatched.push(row.name); continue; }
  await sql`
    UPDATE teams
    SET mascot = ${t.mascot ?? null},
        color = ${t.color ?? null},
        alt_color = ${t.alternateColor ?? null}
    WHERE id = ${row.id}
  `;
  updated++;
}
console.log(`Updated ${updated} of ${rows.length} teams.`);
console.log(`No CFBD record for ${unmatched.length}: ${unmatched.slice(0, 10).join(", ")}${unmatched.length > 10 ? " ..." : ""}`);
const missing = await sql`SELECT count(*)::int n FROM teams WHERE is_fbs AND mascot IS NULL`;
console.log(`FBS teams still missing a mascot: ${missing[0].n}`);
await sql.end();
