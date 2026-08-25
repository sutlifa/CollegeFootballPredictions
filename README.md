# CollegeFootballPredictions

App to predict college football seasons: predict every FBS game of the 2026
season week by week, and see the resulting standings, computer rankings, and
a hand-picked 12-team playoff bracket -- all computed automatically from your
predictions. Once games are actually played, it syncs real results from ESPN
daily and tracks how your predictions compared.

## Stack

Next.js (App Router) + Postgres (Vercel Marketplace, e.g. Neon), deployed on
Vercel. Single-user, no auth.

## Setup

1. Install dependencies: `npm install`
2. Provision a Postgres database (Vercel dashboard -> Storage -> Marketplace,
   or any Postgres works locally) and set `DATABASE_URL` (see `.env.example`).
3. Run the schema: `npm run db:migrate`
4. Seed the ~136 FBS teams: `npm run seed:teams`
5. Resolve ESPN team IDs (needed before pulling schedules/results):
   `npm run seed:espn-ids`. If it reports unresolved ESPN team names, add
   them to `lib/data/team-name-aliases.json` and re-run.
6. Seed the Weeks 1-15 schedule from ESPN:
   `curl -X POST "http://localhost:3000/api/admin/seed-schedule" -H "x-admin-secret: $ADMIN_SECRET"`
   (add `?week=N` to seed a single week, and `&dates=YYYYMMDD` if a given
   week doesn't resolve to the right date range)
7. `npm run dev` and start predicting at `/weeks/1`.

Week 16 (conference championships) is never pulled from ESPN -- it's derived
automatically from your Weeks 1-15 predicted standings.

## Cron

`vercel.json` schedules `/api/cron/sync-results` once daily (Hobby-plan cron
limit) to pull real final scores from ESPN and populate the Results page. Set
`CRON_SECRET` in your Vercel project so Vercel's auto-attached auth header is
validated.
