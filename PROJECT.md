# College Football Predictions — project context

Read this first. It exists so a session can skip re-deriving what previous
sessions already settled. Everything here is load-bearing; where a value was
tuned against real data, the reason is given, because the reason is what
stops it being "fixed" back into a bug.

## What it is

Users predict every FBS game of the season (winner + margin bucket). The app
derives standings, computer rankings, conference championship matchups, a
12-team CFP bracket, and a leaderboard scored against real results.

Multi-user, Google OAuth. Every user has an independent set of predictions;
everything downstream is computed **per user**.

Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, `postgres`
(postgres.js) against Neon, deployed on Vercel. Repo:
`sutlifa/CollegeFootballPredictions`.

## Commands

```bash
npm run dev            # never run concurrently with build (see Landmines)
npm run build
npm run db:migrate
npm run seed:teams
```

## Layout

`lib/` is pure logic, DB-free where it can be — that is what makes it
testable against real data from a script.

| file | role |
| --- | --- |
| `computerRankings.ts` | the power rating. Most-iterated file in the repo; read its header before touching it |
| `standings.ts` | W/L tallies, overall and in-conference |
| `tiebreakerRules.ts` | pure per-conference tiebreak procedures + `explainTiebreak` |
| `conferenceTiebreakers.ts` | DB wrapper over the above; freezes final standings |
| `deriveWeek16.ts` / `syncWeek16.ts` | derives conference championship matchups |
| `bracket.ts` | CFP field candidates + seeding |
| `seasonScore.ts` | end-of-season points |
| `leaderboard.ts` | in-season accuracy |
| `margin.ts` | the four margin buckets |
| `queries.ts` | all SQL; `mapGame` derives predicted scores from winner+bucket |
| `cfbd.ts` / `ingest.ts` | CollegeFootballData API |

Routes: `/` `/weeks/[week]` `/standings` `/rankings` `/bracket` `/leaderboard`,
plus `app/api/{cron/sync-results,admin/*,auth}`.

Tables: `teams` `games` `predictions` `week_submissions` `bracket_field`
`bracket_picks` `conference_final_standings` `real_*` (real results, for
scoring) `sync_runs`. `predictions_score_backup` is the pre-margin-bucket
backup — do not drop it.

## Predictions are winner + margin bucket

Not exact scores. Buckets are `1-7 / 8-14 / 15-21 / 22+` (ids 0-3, names
Close/Medium/Large/Blowout) with representative margins 4/11/18/28 and a
nominal losing score of 21. Downstream math still sees a score pair, derived
in `mapGame`, so nothing below the query layer had to change.

Week 16 is conference championships and is **excluded from pick totals** —
it is scored separately.

## Computer rankings — the invariants

The rating is deliberately **additive, separate terms**, never one blended
accumulator. A single accumulator was tried and repeatedly failed the same
way: enough quality credit let an 11-2 team out-rate a 12-1 team in the same
conference, and no amount of retuning could make that impossible.

```
rating = recordComponent + squashed(quality) + confChampAdjustment
         + priorWeight(seasonProgress) * preseasonPrior
```

Guarantees that must survive any change — verify, don't assume:

1. **Within a conference, a strictly better record always ranks higher —
   at season's end.** The only exception is a conference champion, which is
   allowed to pass a better record. This is arithmetic, not tuning: the
   non-record terms are bounded to a fraction of one record step. It holds
   *once the prior has faded*; before then a 2-1 preseason top-10 team above
   an unheralded 3-0 team is intended, and is what real polls do. When
   auditing, expect roughly 65 such pairs at week 0 and 110 at week 2,
   falling to 1 by week 4 and 0 at the end — measuring an early-season board
   against end-of-season logic will look alarming and is not a bug.
2. **No Group of Six team above a Power Four team that also has a better
   record.**
3. **A bye week is neutral** — never advantage a team for having played
   fewer games.
4. Wins are scaled by conference tier; **losses are flat**. Scaling both
   made a weak conference's own losses cheap, which put a 3-9 G6 team above
   a 5-7 P4 team.
5. Sorting uses the **exact rating**, never the rounded display score.
   Rounding collapsed genuinely different ratings into alphabetical order.
6. The squash is `tanh`, never a hard clamp. A clamp pinned several teams to
   an identical value and destroyed the comparison the term exists to make.

### Tuned constants and why they are what they are

- `RECORD_WEIGHT_BASE = 55`, wins × conference tier, losses flat.
- `NON_RECORD_HEADROOM_FRACTION = 0.2` of a record step — this is what makes
  guarantee 1 true by arithmetic. Scaled per conference; a flat cap was not
  enough because a MAC win is only worth 16.5.
- `NON_RECORD_SCALE = 150` — the squash divides by this **fixed** scale, not
  by the team's own headroom. Dividing by headroom re-introduced saturation:
  a MAC headroom of 3.3 makes `tanh(quality/3.3)` numerically 1.0 for any
  real input, tying every MAC team.
- **The record/quality balance inverts across the season.** Late, record
  dominates and quality is a tiebreak. Early, that is backwards — a win pays
  a flat `55 × tier` whoever it came against, so week 1 only knew *that* you
  played, not *who* you beat, and a preseason #14 jumped to 6th for handling
  a mid-major. So `recordComponent` is scaled by `(1 - preseasonWeight)`,
  and quality gets the room record is not using yet via `seasonHeadroom`
  (`EARLY_QUALITY_BOOST = 8`) and `qualityScale` (tanh input scaled by
  season progress, because after one game raw quality is a few points and
  `tanh(5/150)` squashes every team to the same nothing). Both land on their
  strict values at `preseasonWeight = 0`, so a completed season is
  untouched. Check: USC beating a #123 should move ~1 spot; beating the #1
  team should move them to the top.
- `PRESEASON_PRIOR_PER_SIGMA = 165`, `PRIOR_FADE_GAMES = 6`. The preseason
  poll is the **starting** power level and fades to **exactly zero** by six
  games — exactly zero because the guarantees above are proved from the
  record term, and a prior that never quite vanished would sit outside that
  proof.
- The fade is driven by **season progress across the whole board**, not
  per-team games played. Per-team fading punished playing: a 3-1 team
  outranked a 4-1 conference rival who had simply played once more.
- Rank → strength goes through the **normal quantile**, not linearly. Linear
  spacing claims #1-to-#14 equals #100-to-#113; it made one week-0 win worth
  ~11 spots and put a preseason #14 at #1 after a single game.
- `CONFERENCE_TIER` — SEC/Big Ten 1.28, Independent 1.1, Big 12 1.06, ACC
  1.055 … MAC 0.3. These were tuned against the user's judgment over many
  rounds (Miami too low, Texas Tech too high, American needed a small
  boost). **Do not retune casually.** When a specific team looked wrong, the
  cause was usually a threshold elsewhere, not the tier — a 13-0 Texas Tech
  ranking too high turned out to be `RECORD_NOISE_THRESHOLD`, not the Big 12
  tier, and tiers were adjusted wrongly first.

Display score is `50 + 50*tanh(rating/500)` rounded to **3 decimals**.

## Landmines

- **Never run `next build` while `next dev` is running.** It corrupts
  `.next/dev/types`, producing 404s and hydration failures. Fix:
  `rm -rf .next`, then run them sequentially.
- **React 19 resets a form after a server action completes**, wiping the DOM
  state of controlled radios. `GamePicker` therefore uses plain buttons
  writing to hidden inputs, which are immune. Do not "simplify" it back.
- **`prepare: false` is required** on the Neon pooled connection.
- `{/* */}` is invalid in JSX ternary expression position — use bare `/* */`.
- Absolutely-positioned tooltips contribute to a scroll container's
  overflow. The standings tables avoid scrollbars by having no `overflow` at
  all, rounding cells via `border-separate`.
- Week 16 must not regenerate once submitted (`if (week === 16 && !submitted)`),
  and editing a prediction only clears frozen standings for regular-season
  weeks.
- Kickoffs: CFBD publishes `startTimeTBD` with a placeholder that renders as
  midnight ET on the wrong day. Show TBD; prefer confirmed kickoffs when
  computing a week's lock time. A genuine late-night Hawaii kickoff is rare
  but real, so trust the flag rather than the hour.
- Shell quoting mangles `node -e` with nested quotes and template literals —
  write a temp `.mjs` file instead.

## Verifying a ranking change

Always check against real predictions before believing a change is good —
the DB has two complete seasons (users 1 and 27) and several partial ones
(34 = weeks 0-4, 14 = weeks 0-2, 43 = week 0 only), which is exactly the
spread needed to catch early-season and end-of-season regressions
separately.

Write a temp script in the project root and run it with the real env:

```bash
node --env-file=.env.local --import tsx diag.mjs
```

Load `getAllTeams()`, `getAllGames(userId)`, `getSubmittedWeeks(userId)`,
filter games to submitted weeks, then assert the guarantees above. A full
ranking is ~30ms and a whole-season weekly replay ~60ms, so this is cheap.
Delete the script afterwards.

## Secrets

`CFBD_API_KEY`, Google OAuth client id/secret, `AUTH_SECRET` and
`DATABASE_URL` live only in `.env.local` (gitignored) and Vercel env vars.
**Never echo them.** Diagnostic scripts that read `.env.local` must not
print them — print `new URL(DATABASE_URL).host`, never the URL.

## Conventions

Comments explain *why*, especially where a value was tuned or an obvious
simpler approach was tried and failed. Several constants here look
arbitrary and are not; the comment is the reason they survive.
