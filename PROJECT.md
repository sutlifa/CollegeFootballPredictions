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

The rating reads like an AP poll: strength of schedule, quality wins and bad
losses decide it, **not** record alone. A tough 6-6 Power Four team can
finish above a soft 8-4 Group of Six team, and does. Record forcing survives
in exactly one place — guarantee 1, within a conference, at season's end.

It is deliberately **additive, separate terms**, never one blended
accumulator. A single accumulator was tried and repeatedly failed the same
way: enough quality credit let an 11-2 team out-rate a 12-1 team in the same
conference, and no amount of retuning could make that impossible.

```
rating = recordComponent + squashed(quality) + confChampAdjustment
         + priorWeight(seasonProgress) * preseasonPrior
```

Guarantees that must survive any change — verify, don't assume:

1. **Within a conference, a strictly better record always ranks higher —
   at season's end only.** Enforced directly by
   `enforceConferenceRecordOrder`, a post-sort pass, NOT by the arithmetic
   any more. Teams keep the slots their conference already occupies and are
   reordered within them, so it settles who is third in the Big Ten without
   touching where the Big Ten sits relative to the SEC. Sorting is by
   effective record (regular-season W−L, plus half a win for a title), so an
   8-4 champion still stays behind an 11-1 rival. **Gated on
   `preseasonWeight === 0`** — applied earlier it recreates the bug the
   prior exists to prevent, hoisting a 1-0 team above every 0-0 conference
   rival in week 0. Before the gate opens, early-season inversions are
   expected and correct.
2. **No badly-losing team above a much better record** (the 3-9 G6 vs 5-7 P4
   complaint). Structural: sub-.500 games count flat for everyone.
3. **A bye week is neutral** — never advantage a team for having played
   fewer games.
4. **No conference champion below a team with a losing record.**
5. **Conference tier scales how far a team is above .500; at or below .500
   everything is flat.** A weak schedule discounts what winning *proves*,
   never what losing *costs*. Two earlier versions each got half of this and
   failed oppositely: tiering the whole win-minus-loss count made a weak
   conference's own losses cheap (3-9 G6 above 5-7 P4), while tiering only
   the wins meant a MAC win paid 16.5 against a flat 55-point loss, so
   Toledo won the MAC at 9-4 and still sat below three 5-7 teams.
6. Sorting uses the **exact rating**, never the rounded display score.
   Rounding collapsed genuinely different ratings into alphabetical order.
7. The squash is `tanh`, never a hard clamp. A clamp pinned several teams to
   an identical value and destroyed the comparison the term exists to make.

### Tuned constants and why they are what they are

- `RECORD_WEIGHT_BASE = 55`; conference tier scales games above .500,
  everything at or below .500 counts flat (see guarantee 5).
- `NON_RECORD_HEADROOM_FRACTION = 2` — how far quality/SOS may move a team.
  It was 0.2, sized so quality could never bridge one record step, which
  made record dominance true by arithmetic *everywhere*. That did real work
  inside a conference and real damage across conferences: the rating knew
  about schedule, quality wins and bad losses and was then forbidden to act
  on any of it, so the tier constants alone had to carry every
  cross-conference judgement — which is why the board kept needing retuning.
  Within-conference ordering moved to guarantee 1 instead. **Do not
  reintroduce an early-season multiplier on this**: an older
  `EARLY_QUALITY_BOOST` of 8x was sized against the 0.2 bound, and against
  2.0 it produced a week-0 headroom of ~844 and sent a team to #1 for
  beating a preseason #120.
- `NON_RECORD_SCALE = 150` — the squash divides by this **fixed** scale, not
  by the team's own headroom. Dividing by headroom re-introduced saturation:
  a MAC headroom of 3.3 makes `tanh(quality/3.3)` numerically 1.0 for any
  real input, tying every MAC team.
- **The record/quality balance inverts across the season.** Late, record
  dominates and quality is a tiebreak. Early, that is backwards — a win pays
  a flat `55 × tier` whoever it came against, so week 1 only knew *that* you
  played, not *who* you beat, and a preseason #14 jumped to 6th for handling
  a mid-major. So `recordComponent` is scaled by `(1 - preseasonWeight)`,
  and quality gets the room record is not using yet via the headroom
  and `qualityScale` (tanh input scaled by
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
- `CONFERENCE_TIER` — SEC/Big Ten 1.28, Independent 1.121, Big 12 1.087,
  ACC 1.083, American 0.739, Pac 12 0.654, Mountain West 0.569, Sun Belt
  0.526, CUSA 0.484, MAC 0.441. FCS 0.2 and is not part of the ladder — it
  is the floor the others are measured from, and stays put.

  One number per conference drives everything conference-dependent: record
  value above .500 (`55 × tier`), record step (`55 × min(tier, 1)`),
  headroom (`2 × step`), the conference-title bonus (`0.5 × step`), the
  quality credit for beating that conference (`× tier`), and the penalty
  for losing to it (`1.55 − 0.55 × tier`, keyed to the OPPONENT's
  conference, never your own).

  Everything below the SEC/Big Ten pair was moved 15% of its remaining
  distance to 1.28 at the user's request, then trimmed a flat 0.006. That
  flipped one comparison worth knowing about: a 13-0 Big 12 champion now
  edges a 12-1 SEC champion on the record term (777.2 vs 774.4), where it
  previously trailed. The flip point is Big 12 = 1.0831, so the current
  1.087 clears it by 0.004.

  Useful sense of scale, since this ladder invites small nudges: a flat
  0.006 trim across every tier moved exactly one team on two full seasons
  (East Carolina, one spot). Tier changes below roughly 0.01 are noise at
  138 teams — reach for 0.02+ to actually move a board.

  **Do not retune casually.** When a specific team looked wrong, the cause
  was usually a threshold elsewhere, not the tier — a 13-0 Texas Tech
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
