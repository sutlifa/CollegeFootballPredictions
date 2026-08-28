/**
 * Sets teams.preseason_rank from the CBS Sports preseason rankings, which
 * rank ALL 138 FBS teams rather than just a top 25 -- so every team starts
 * the season with a real position instead of a null.
 *
 * Run with the scraped rankings JSON as the only argument:
 *   node --env-file=.env.local --import tsx scripts/seed-preseason-ranks.mjs <ranks.json>
 * where ranks.json is [{ "rank": 1, "team": "Ohio State" }, ...].
 *
 * Aborts without writing anything unless all 138 map onto a team we know
 * about -- a partial import would leave the rankings silently half-stale.
 */
import { readFileSync } from "fs";
import { sql } from "../lib/db.ts";

/**
 * CBS abbreviates team names; these map onto our canonical `teams.name`.
 * Written out explicitly rather than expanding prefixes mechanically,
 * because the abbreviations are genuinely ambiguous: "C. Michigan" is
 * Central but "C. Carolina" is Coastal.
 */
const ALIASES = {
  "Texas A&amp;M": "Texas A&M",
  "Miami (Fla.)": "Miami",
  Hawaii: "Hawai'i",
  "Arizona St.": "Arizona State",
  "Boise St.": "Boise State",
  "Miss. State": "Mississippi State",
  "Michigan St.": "Michigan State",
  "Iowa St.": "Iowa State",
  "San Diego St.": "San Diego State",
  "N. Dakota St.": "North Dakota State",
  "Fresno St.": "Fresno State",
  "Miami-OH": "Miami (OH)",
  "Texas St.": "Texas State",
  "W. Kentucky": "Western Kentucky",
  "Washington St.": "Washington State",
  FAU: "Florida Atlantic",
  "W. Michigan": "Western Michigan",
  "Utah St.": "Utah State",
  "Jacksonville St.": "Jacksonville State",
  "Arkansas St.": "Arkansas State",
  "Colorado St.": "Colorado State",
  "Ga. Southern": "Georgia Southern",
  "Kennesaw St.": "Kennesaw State",
  "C. Michigan": "Central Michigan",
  "App. St.": "App State",
  FIU: "Florida International",
  "E. Michigan": "Eastern Michigan",
  "C. Carolina": "Coastal Carolina",
  "New Mexico St.": "New Mexico State",
  "San Jose St.": "San José State",
  "Missouri St.": "Missouri State",
  "N. Illinois": "Northern Illinois",
  "Kent St.": "Kent State",
  "So. Miss": "Southern Miss",
  "UL-Monroe": "UL Monroe",
  "Sacramento St.": "Sacramento State",
  "Georgia St.": "Georgia State",
  "Middle Tenn.": "Middle Tennessee",
  "Ball St.": "Ball State",
  UMass: "Massachusetts",
};

const path = process.argv[2];
if (!path) {
  console.error("usage: seed-preseason-ranks.mjs <ranks.json>");
  process.exit(1);
}
const ranked = JSON.parse(readFileSync(path, "utf8"));
console.log("ranked teams in file:", ranked.length);

const teams = await sql`SELECT id, name FROM teams WHERE is_fbs`;
const byName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

const resolved = [];
const unmatched = [];
for (const row of ranked) {
  const canonical = ALIASES[row.team] ?? row.team;
  const team = byName.get(canonical.toLowerCase());
  if (team) resolved.push({ rank: row.rank, teamId: team.id, name: team.name });
  else unmatched.push(row);
}

if (unmatched.length > 0) {
  console.error(`\n${unmatched.length} rankings did not match a team -- nothing written:`);
  unmatched.forEach((r) => console.error(`  ${r.rank}. "${r.team}"`));
  process.exit(1);
}
console.log("all", resolved.length, "matched a team");

// Every FBS team should end up ranked; flag any that would be left null.
const rankedIds = new Set(resolved.map((r) => r.teamId));
const missing = teams.filter((t) => !rankedIds.has(t.id));
if (missing.length > 0) {
  console.error(`\n${missing.length} FBS teams have no ranking -- nothing written:`);
  missing.forEach((t) => console.error(`  "${t.name}"`));
  process.exit(1);
}

await sql.begin(async (tx) => {
  // Clear first so a team dropping out of the list doesn't keep a stale rank.
  await tx`UPDATE teams SET preseason_rank = NULL WHERE is_fbs`;
  for (const r of resolved) {
    await tx`UPDATE teams SET preseason_rank = ${r.rank} WHERE id = ${r.teamId}`;
  }
});

const check = await sql`
  SELECT COUNT(*)::int AS ranked,
         MIN(preseason_rank)::int AS lo,
         MAX(preseason_rank)::int AS hi,
         COUNT(*) FILTER (WHERE preseason_rank IS NULL)::int AS unranked
  FROM teams WHERE is_fbs
`;
console.log("after write:", check[0]);
const top = await sql`SELECT preseason_rank, name FROM teams WHERE is_fbs ORDER BY preseason_rank LIMIT 5`;
console.log("top 5:", top.map((t) => `${t.preseason_rank}. ${t.name}`).join(", "));
process.exit(0);
