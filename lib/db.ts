import postgres from "postgres";

// Falls back to an empty string instead of throwing at module load so that
// `next build`'s route analysis (which imports this module without ever
// running a query) doesn't fail just because DATABASE_URL isn't set in the
// current environment. postgres.js doesn't open a connection until the
// first query runs, so a real, clear connection error only surfaces then.
export const sql = postgres(process.env.DATABASE_URL ?? "", {
  ssl: "require",
});
