# College Football Predictions

Predict every FBS game of the season, then watch the consequences play out.
Pick a winner and a margin for all ~900 games, and the app derives your
conference standings, a computer poll, the conference championship matchups,
a 12-team playoff bracket, and a leaderboard scoring everyone's picks against
real results as they come in.

It's a season simulator driven entirely by your own opinions. Nothing is
guessed for you — but everything downstream of a pick is computed, including
the parts that are genuinely fiddly (nine conferences' real tiebreaker
procedures, playoff seeding, strength of schedule).

Multiple people can share one deployment. Everyone has their own independent
set of predictions, and every derived view — standings, rankings, bracket —
is computed per user, so no two people's seasons interfere.

---

## How you use it

**Pick a week.** `/weeks/1` through `/weeks/16`. Every game is one row, with
four margin buttons beside each team:

```
  1-7  8-14  15-21  22+   [Oregon]  VS  [Washington]   1-7  8-14  15-21  22+
```

One click does it. Tapping `8-14` beside Oregon says "Oregon by 8–14" — there
is no separate winner control that can drift out of sync with the margin.
Margins are buckets rather than exact scores because nobody has a real
opinion about whether it's 31-17 or 34-20, but everybody has one about
whether it's close, comfortable, or a blowout.

**Weeks lock when they start.** Once the first game of a week kicks off, that
week's picks freeze — fantasy-football rules. Enforced on the server, not
just hidden in the UI.

**Weeks auto-submit.** Fill in every game and the week submits itself; change
a pick later and it re-submits. A week only counts toward standings and
rankings once it's complete.

**Or pick by team.** `/teams` lists all 138; open one and you get its whole
season on a single page — every game from week 0 through the conference
championship, your pick on each, and the real result once it's played. Picks
made there are the same picks as on the week pages; change one in either
place and it changes in both. Team names link through from the rankings and
standings tables.

**Then look at what you did.** `/standings` groups every conference with
tiebreakers already resolved, `/rankings` is the computer poll, `/bracket`
builds the playoff field, `/leaderboard` scores everyone once real games are
played.

**Week 15** is Army–Navy. **Week 16** is conference championship week, and is
never fetched from an API — it's derived from your own standings, so the
title games are whoever *your* season put there. It stays empty until the
whole regular season is in, since matchups built from a half-finished table
tell you which weeks you've filled in rather than who's playing for a
title.

---

## How it's built

**Frontend.** Next.js 16 App Router, React 19, Tailwind v4. Almost everything
is a Server Component reading Postgres directly. Only three components need
interactivity and are therefore client components — the game picker, the
playoff field selector, and the mobile nav — plus one error boundary, which
Next requires to be one. Mutations are Server Actions posted from plain
`<form>` elements, so the core pick-saving path works without client
JavaScript.

Everything is responsive to ~375px. Tables drop their least important columns
on phones and fold that data under the team name rather than scrolling
sideways.

**Backend.** There isn't a separate one. Server Components and Server Actions
talk to Postgres through [postgres.js](https://github.com/porsager/postgres);
`lib/` holds the logic and `lib/queries.ts` holds every SQL statement. Three
route handlers exist for things that can't be a Server Action: OAuth, the
admin schedule seeder, and the daily cron.

**Database.** Postgres (Neon via the Vercel Marketplace). Twelve tables; the
ones that matter are `teams`, `games` (schedule plus real results),
`predictions` (winner + margin bucket, unique per user per game), and
`week_submissions`. Rankings and standings are **computed on read**, never
cached — at 138 teams and ~900 games a full ranking takes ~30ms, so a cache
would be complexity buying nothing. The one exception is
`conference_final_standings`, frozen once the regular season completes so a
late edit can't silently rewrite history.

**Auth.** Auth.js v5 with Google. JWT sessions, no adapter tables — users are
upserted on first sign-in.

**Data.** [CollegeFootballData.com](https://collegefootballdata.com) for the
schedule, teams, logos, conference alignment, and real scores. Not ESPN:
their endpoint blocks automated requests from cloud infrastructure (Akamai
bot detection, confirmed from both Vercel runtimes), so it only ever worked
from a residential connection and never in production.

### The interesting parts

**`lib/computerRankings.ts`** is the computer poll, and by far the
most-iterated file here. It's meant to read like an AP ballot: strength of
schedule, quality wins and bad losses decide it, not record alone. A tough
6-6 Power Four team can and does finish above a soft 8-4 Group of Six team.

Teams start the season at their preseason poll position, and that starting
point fades to exactly zero influence about six games in — so a finished
season is decided purely by what happened on the field. Beating a good team
moves you meaningfully; beating an FCS team barely registers. Conference
strength scales what a winning record *proves*, never what a loss *costs*, so
a weak schedule can't inflate you and can't shelter you either.

One rule is asserted rather than earned: inside a single conference a better
record always finishes higher, with a conference title worth half a win. That
lives in one function so it can't leak into comparisons it was never meant to
govern.

**`lib/tiebreakerRules.ts`** implements each conference's *actual* published
tiebreaker procedure — including the three- and four-way variants with their
restart-and-remerge rules — and can explain in words why any two teams are
ordered as they are. The explanations are generated from the same code that
does the ordering, so they can't contradict the table.

**`lib/eloRankings.ts`** is a complete rank-driven Elo model that is **off**.
It was built, measured against two full seasons, and rejected: Elo is a
*predictive* rating, so a 3-9 team from a strong conference that loses close
to good teams scores well, because every loss was expected and therefore
nearly free. A poll ranks résumés. It's kept behind `RANKING_MODEL=elo` so
the comparison stays reproducible instead of being a claim in a commit
message.

---

## Running it

```bash
npm install
```

Create `.env.local`:

```
DATABASE_URL=          # Postgres connection string (pooled is fine)
CFBD_API_KEY=          # free at https://collegefootballdata.com/key
AUTH_SECRET=           # openssl rand -base64 32
AUTH_GOOGLE_ID=        # Google Cloud console -> OAuth 2.0 Client ID
AUTH_GOOGLE_SECRET=
ADMIN_SECRET=          # any random string; guards the schedule seeder
CRON_SECRET=           # any random string; validates Vercel's cron header
```

Google OAuth needs `http://localhost:3000/api/auth/callback/google` as an
authorized redirect URI (plus your production URL for the deployed app).

```bash
npm run db:migrate     # create the schema
npm run seed:teams     # FBS teams, conferences, logos, preseason poll
npm run dev
```

Then seed the schedule — the app has no games until you do:

```bash
curl -X POST "http://localhost:3000/api/admin/seed-schedule" -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

Add `?week=N` to seed a single week. Weeks 1–15 come from the API; week 16 is
derived from your predictions and needs no seeding.

`npm run seed:teams` pulls the *current* FBS roster from CFBD rather than a
static list, so re-run it whenever realignment happens or a program moves in
or out of FBS.

### Weekly pick reminders (optional)

The daily cron can email anyone whose picks for the upcoming week aren't
finished: a nudge when the week is two-to-three days from locking, and a last
call on the final run before it locks. It rides the existing cron rather than
taking a second slot, since Hobby caps how many a project gets.

**It sends nothing until you set two variables.** A provider key alone is
not enough — `EMAIL_REMINDERS_ENABLED` must also be exactly `true`. Until
then the whole path runs and reports who *would* have been mailed, which is
also how you test it. Set `APP_URL` so links point at your deployment.

Two providers are supported, and they differ on the one thing that matters:
**who you're allowed to email.** Resend won't deliver to anyone but the
account owner until you verify a **domain** you control. Brevo verifies a
single **sender address** instead — confirm a link sent to your own inbox
and you can mail anyone, 300/day free, no domain. Set `BREVO_API_KEY` (it
wins if both are present) or `RESEND_API_KEY`, and `EMAIL_FROM` to the
address you verified.

Every send is recorded in `email_sends`, unique on (user, season, week,
kind), so a retried or double-fired cron can't mail the same person twice.
Every mail carries an unsubscribe link that needs no sign-in.

A note on timing: Hobby cron runs once a day, which can't hit a narrow
window — a week locking at 23:00 UTC is ten hours away at the 13:00 run and
already locked by the next one. "Last call" therefore means *the last
scheduled run before lock*, which is the tightest promise a daily job keeps.

### Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build — never run while `dev` is running; they share `.next` and it corrupts generated types |
| `npm run lint` | eslint |
| `npm run db:migrate` | apply `lib/db/schema.sql` |
| `npm run seed:teams` | teams, conferences, logos, preseason ranks |

`scripts/seed-preseason-ranks.mjs` overrides preseason ranks from a full
138-team poll and refuses to write unless every team matches by name.
`scripts/migrate-margin-picks.mjs` is the one-time conversion from exact
scores to margin buckets; it backs up to `predictions_score_backup` first.

---

## Deploying

Push to `main` and Vercel builds it. Set every variable from `.env.local` in
the project's environment settings, and add your production callback URL to
the Google OAuth client.

`vercel.json` runs `/api/cron/sync-results` daily at 13:00 UTC — the Hobby
plan's once-a-day limit — pulling real final scores for the whole season in a
single request rather than one per week, which keeps it comfortably inside
CFBD's free 1,000 calls/month.

---

## Notes for contributors

`PROJECT.md` (loaded automatically by Claude Code via `CLAUDE.md`) carries
what's expensive to rediscover: which ranking invariants must hold and how to
verify them against real data, why each tuned constant has the value it does,
and the landmines — several of which cost real debugging time and none of
which are obvious from the code.

The short version, if you read one paragraph: **the ranking constants look
arbitrary and are not.** Most were set against real predicted seasons after a
specific result looked wrong, and the comment above each explains which
result. Before changing any of them, run the invariant checks in `PROJECT.md`
against the seasons already in the database — a change that looks obviously
right in isolation has a strong track record of breaking something three
conferences away.
