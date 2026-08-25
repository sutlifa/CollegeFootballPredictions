# CollegeFootballPredictions

App to predict college football seasons: predict every FBS game of the 2026
season week by week, and see the resulting standings, computer rankings, and
a hand-picked 12-team playoff bracket -- all computed automatically from your
predictions. Once games are actually played, it syncs real results from
CollegeFootballData.com daily and tracks how your predictions compared.

## Stack

Next.js (App Router) + Postgres (Vercel Marketplace, e.g. Neon), deployed on
Vercel. Single-user, no auth.

Schedule/results data comes from [CollegeFootballData.com](https://collegefootballdata.com)
(a free, documented API built for exactly this), not ESPN -- ESPN's endpoint
blocks automated requests from any cloud/server infrastructure (Akamai
bot-detection, confirmed from both Vercel's Node and Edge runtimes), so it
only ever worked from a residential connection, never in production.

## Setup

1. Install dependencies: `npm install`
2. Provision a Postgres database (Vercel dashboard -> Storage -> Marketplace,
   or any Postgres works locally) and set `DATABASE_URL` (see `.env.example`).
3. Get a free API key at https://collegefootballdata.com/key and set
   `CFBD_API_KEY`.
4. Run the schema: `npm run db:migrate`
5. Seed teams: `npm run seed:teams`. This pulls the *current* FBS roster,
   conference alignment, logos, and the real AP preseason poll straight from
   CFBD -- it's the source of truth, not a static list, so re-run it any
   time realignment happens or a program moves in/out of FBS (e.g. a team
   newly joining FBS shows up automatically on the next run).
6. Seed the Weeks 1-15 schedule:
   `curl -X POST "http://localhost:3000/api/admin/seed-schedule" -H "x-admin-secret: $ADMIN_SECRET"`
   (add `?week=N` to seed a single week)
7. `npm run dev` and start predicting at `/weeks/1`.

Week 15 is the Army-Navy game and Week 16 is Conference Championship week --
the latter is never pulled from the API, it's derived automatically from
your Weeks 1-15 predicted standings.

## Cron

`vercel.json` schedules `/api/cron/sync-results` once daily (Hobby-plan cron
limit) to pull real final scores and populate the Results page. Set
`CRON_SECRET` in your Vercel project so Vercel's auto-attached auth header is
validated. The free CFBD tier allows 1,000 calls/month, so this is used
sparingly -- one call per sync (the whole season's games in one request), not
per-week.
