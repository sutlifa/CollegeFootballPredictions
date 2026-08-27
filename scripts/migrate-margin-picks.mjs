/**
 * One-off migration: exact-score predictions -> winner + margin bucket.
 *
 * Every existing prediction is converted in place, so anyone who already
 * typed out full scores keeps all of their picks: the winner is whoever
 * they gave the higher score, and the margin bucket is whichever range
 * their point difference falls into.
 *
 * The original scores are copied to `predictions_score_backup` first and
 * that table is never dropped -- this migration is destructive (the score
 * columns go away) and it runs against real users' data, so the old values
 * stay recoverable.
 *
 * Safe to re-run: it detects whether the new columns already exist and
 * skips the parts that are already done.
 */
import { sql } from "../lib/db.ts";

const [{ has_new }] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'predictions' AND column_name = 'margin_bucket'
  ) AS has_new
`;
const [{ has_old }] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'predictions' AND column_name = 'predicted_score_team1'
  ) AS has_old
`;

console.log("margin_bucket column present:", has_new);
console.log("predicted_score columns present:", has_old);

if (!has_old && has_new) {
  console.log("Already migrated -- nothing to do.");
  process.exit(0);
}

const [{ count: before }] = await sql`SELECT COUNT(*)::int AS count FROM predictions`;
console.log("predictions to migrate:", before);

// 1. Back up the exact scores before anything destructive happens.
await sql`
  CREATE TABLE IF NOT EXISTS predictions_score_backup AS
  SELECT id, user_id, game_id, predicted_score_team1, predicted_score_team2, created_at, updated_at
  FROM predictions
`;
const [{ count: backedUp }] = await sql`SELECT COUNT(*)::int AS count FROM predictions_score_backup`;
console.log("rows in predictions_score_backup:", backedUp);
if (backedUp < before) {
  throw new Error(`Backup has ${backedUp} rows but predictions has ${before} -- aborting.`);
}

// 2. Add the new columns (nullable at first so the backfill can run).
if (!has_new) {
  await sql`ALTER TABLE predictions ADD COLUMN winner_team_id INTEGER REFERENCES teams(id)`;
  await sql`ALTER TABLE predictions ADD COLUMN margin_bucket SMALLINT`;
  console.log("added winner_team_id + margin_bucket");
}

// 3. Backfill from the entered scores. Ties were already rejected at input
//    time, so every row has a strict winner.
const filled = await sql`
  UPDATE predictions p
  SET winner_team_id = CASE
        WHEN p.predicted_score_team1 > p.predicted_score_team2 THEN g.team1_id
        ELSE g.team2_id
      END,
      margin_bucket = CASE
        WHEN ABS(p.predicted_score_team1 - p.predicted_score_team2) <= 7 THEN 0
        WHEN ABS(p.predicted_score_team1 - p.predicted_score_team2) <= 14 THEN 1
        WHEN ABS(p.predicted_score_team1 - p.predicted_score_team2) <= 21 THEN 2
        ELSE 3
      END
  FROM games g
  WHERE g.id = p.game_id AND p.winner_team_id IS NULL
`;
console.log("rows backfilled:", filled.count);

const [{ count: unfilled }] = await sql`
  SELECT COUNT(*)::int AS count FROM predictions WHERE winner_team_id IS NULL OR margin_bucket IS NULL
`;
if (unfilled > 0) {
  throw new Error(`${unfilled} predictions could not be converted -- aborting before dropping scores.`);
}

// 4. Lock the new columns down, then drop the old ones.
await sql`ALTER TABLE predictions ALTER COLUMN winner_team_id SET NOT NULL`;
await sql`ALTER TABLE predictions ALTER COLUMN margin_bucket SET NOT NULL`;
await sql`
  ALTER TABLE predictions
  ADD CONSTRAINT predictions_margin_bucket_check CHECK (margin_bucket BETWEEN 0 AND 3)
`.catch((e) => {
  if (!String(e.message).includes("already exists")) throw e;
});
await sql`ALTER TABLE predictions DROP COLUMN IF EXISTS predicted_score_team1`;
await sql`ALTER TABLE predictions DROP COLUMN IF EXISTS predicted_score_team2`;
console.log("dropped exact-score columns");

const dist = await sql`
  SELECT margin_bucket, COUNT(*)::int AS n
  FROM predictions GROUP BY margin_bucket ORDER BY margin_bucket
`;
console.log("margin bucket distribution:", dist);

const [{ count: after }] = await sql`SELECT COUNT(*)::int AS count FROM predictions`;
console.log("predictions after migration:", after, after === before ? "(unchanged - good)" : "(MISMATCH!)");

process.exit(0);
