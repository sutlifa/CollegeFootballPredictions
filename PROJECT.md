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
| `bracket.ts` | CFP field candidates + seeding. Semifinals pair 1/4 and 2/3, never 1/2 and 3/4 — the latter puts the top two seeds on the same side of the draw. A stored pick is honoured only if that team is actually in that matchup, so reseeding or a shape change drops it instead of rendering a team that lost earlier. The fifth auto-bid goes to the highest-ranked Group of Six **champion**, never merely the highest-ranked Group of Six team — it used to take whoever sat highest, handing the bid to teams that had just lost their title game |
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

Week 16 is conference championships and is **excluded from pick totals AND
from leaderboard grading** — it is scored separately as an end-of-season
bonus (`lib/seasonScore.ts`). Grading it alongside regular-season picks put
two numbers on one leaderboard row that described different slates: a hit
rate measured over more games than the "picked" column counted.

Leaderboard margin accuracy is `correctMargins / correctPicks`, not out of
all picks — getting the margin "right" on a game you picked the wrong way
isn't credited. The bucket boundaries used to grade real results are
**generated from `MARGIN_BUCKETS`** by `marginBucketSqlCase`, not
transcribed into the SQL; a hand-kept copy of a constant is a bug waiting
for someone to edit one side.

Week 16 is **derived per user, and only once that user's regular season is
complete** (every week through Army-Navy submitted). Deriving it earlier
builds matchups from a part-finished table, which describes which weeks
happen to be filled in rather than who is going to the title game — a user
one week into the season was handed nine pickable championship games, and a
stray pick put a team at 1-0 having played nobody. `syncWeek16Games` now
returns early when the season isn't finished.

**Never bulk-delete incomplete users' week-16 rows.** A user can be one week
short and still have a full, picked championship slate behind it — one has
everything except Army-Navy — and dropping it would destroy their bracket.
`deleteUnpickedWeek16Games` spares any row carrying a prediction.

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

1. **The board is the rating, in order. Nothing reorders it afterwards.**
   The rank a team holds is explained by the number printed next to it, at
   every week of the season. Verified: 0 rank/score disagreements on both
   real boards at weeks 2, 5, 8, 11, 13, 15 and 16.

   `enforceConferenceRecordOrder` used to run last and rewrite
   same-conference order by record. It is no longer called by
   `computeComputerRankings` (still exported — `lib/eloRankings.ts`, the
   alternate model, uses it). It was removed because it broke the line
   above: Georgia sat 3rd on 97.77 above a 2nd-placed Indiana on 96.58, with
   15 such pairs on one board and 27 on the other. It had also become the
   thing that decided championships by fiat.

   **Within a conference, a better record still finishes higher — the
   rating does it unaided.** Measured after removal: 0 same-conference
   record inversions from week 11 onward on both boards. Early season is
   full of them (75 and 84 at week 2, e.g. a 1-1 Ohio State above a 3-0
   USC) and that is correct — the preseason prior is still alive and a
   two-game record proves little. They fall to zero on their own as the
   prior fades, which is exactly what the old `preseasonWeight === 0` gate
   was hand-coding.

1b. **A conference championship is an ordinary game.** It runs the same
   record and quality path as a week-3 game: who you beat, by how much, on
   whose field, and how far above expectation. There is no title-loss
   constant — the loss is priced like any other loss, which is both more
   honest and far larger than the bespoke fraction ever was (that was worth
   about a thirteenth of a normal defeat). Winning still earns a small
   `CONF_CHAMP_WIN_FRACTION` bonus for the trophy itself.

   **A champion passes the team it beat by out-rating it, never by
   decree.** Checked at bonus 0, 0.25 and 0.5: at every value, 0 of 18
   title losers finish above their champion — the ordinary record and
   quality terms already do it. Two earlier attempts to force this (a
   record credit, then a 0.01 epsilon) are gone.

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
- `QUALITY_K = 36` (was 12) — how much one game moves the quality term, so
  *who* a team beat carries about 3× the weight in ordering. Bounded by
  `NON_RECORD_HEADROOM_FRACTION`, so a larger K changes how quality ORDERS
  teams, never how far it can carry them; no record guarantee moves.
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
- `PRESEASON_PRIOR_PER_SIGMA = 165`, `PRIOR_FADE_GAMES = 12`. The preseason
  poll is the **starting** power level and fades to **exactly zero** by
  twelve games. It was six, which made September violent: results carried
  two thirds of their weight by week 3, when the whole field is 3-0 or 2-1
  and a few points apart, so one flat loss penalty moved a team twenty
  places (a top-ten team lost one close game to a ranked opponent and fell
  to 33rd) and a preseason #14 reached #1 at 4-0 partly just for having
  played a fourth game. **14 is too far** — at 13 games played the weight
  never reaches zero, so the end-of-season guarantees stop holding and real
  violations reappear. 12 is the longest fade that still expires within a
  season; completed seasons are unchanged either way — exactly zero because the guarantees above are proved from the
  record term, and a prior that never quite vanished would sit outside that
  proof.
- The fade is driven by **season progress across the whole board**, not
  per-team games played. Per-team fading punished playing: a 3-1 team
  outranked a 4-1 conference rival who had simply played once more.
- Rank → strength goes through the **normal quantile**, not linearly. Linear
  spacing claims #1-to-#14 equals #100-to-#113; it made one week-0 win worth
  ~11 spots and put a preseason #14 at #1 after a single game.
- `CONFERENCE_TIER` — SEC/Big Ten 1.28, Independent 1.121, Big 12 1.085,
  ACC 1.083, American 0.739, Pac 12 0.654, Mountain West 0.569, Sun Belt
  0.526, CUSA 0.484, MAC 0.441. FCS 0.2 and is not part of the ladder — it
  is the floor the others are measured from, and stays put.

  One number per conference drives everything conference-dependent: record
  value above .500 (`55 × tier`), record step (`55 × min(tier, 1)`),
  headroom (`2 × step`), the conference-title bonus (`0.25 × step`), the
  quality credit for beating that conference (`× tier`), and the penalty
  for losing to it (`1.55 − 0.55 × tier`, keyed to the OPPONENT's
  conference, never your own).

  **`CONF_CHAMP_WIN_FRACTION` is only the trophy.** The championship game
  is scored as an ordinary game, so the champion is already paid for it in
  record and quality; this is the extra worth of winning the conference. It
  barely matters — setting it to 0 leaves every champion above its own
  title-game loser anyway. At 0.25 the single visible effect on the real
  boards is a 13-0 Big 12 champion edging a 12-1 team that lost its title
  game, which is what a trophy should be worth. At 0.5 it starts moving
  teams that have no business moving.

  Everything below the SEC/Big Ten pair was moved 15% of its remaining
  distance to 1.28 at the user's request, then trimmed a flat 0.006.

  **Do not move a tier to settle one matchup.** The Big 12 was twice tuned
  to push a 13-0 champion below a 12-1 SEC champion (1.085, then 1.070)
  before that was recognised as the same mechanical forcing this rating is
  meant to have stopped. A tier moves all sixteen of a conference's teams;
  it is not a lever for one comparison. An undefeated Power Four champion
  behind a one-loss team does happen (Florida State 2014, 2023) but it is
  the exception voters argue about, decided on résumé. It now falls out of
  who each team beat, and lands differently in the two completed seasons —
  which is correct, not a defect. If it ever needs governing, write an
  explicit rule about undefeated conference champions.

  Useful sense of scale, since this ladder invites small nudges: a flat
  0.006 trim across every tier moved exactly one team on two full seasons
  (East Carolina, one spot). Tier changes below roughly 0.01 are noise at
  138 teams — reach for 0.02+ to actually move a board.

  **Do not retune casually.** When a specific team looked wrong, the cause
  was usually a threshold elsewhere, not the tier — a 13-0 Texas Tech
  ranking too high turned out to be `RECORD_NOISE_THRESHOLD`, not the Big 12
  tier, and tiers were adjusted wrongly first.

Display score is `50 + 50*tanh(rating/500)` rounded to **3 decimals**.

## An Elo model exists, and is off

`lib/eloRankings.ts` is a full rank-driven Elo ledger, selected with
`RANKING_MODEL=elo` via `lib/rankingModel.ts`. It is **off, and should stay
off.** On two complete seasons it reintroduces 399 and 433 cases of a
badly-losing team ranked above a much better record (against zero) and
drops four conference champions below losing-record teams. Everything it
promotes is a poor-record SEC/Big Ten team; everything it demotes is a
good-record Group of Six team — the original complaint, at scale.

That is what Elo *is*, not a tuning failure: it is a **predictive** rating,
so a 3-9 SEC team losing close to good teams is genuinely strong by its
measure because each loss was expected and nearly free. A poll ranks
**résumés**. Keep it for the comparison; don't ship it.

**Measuring rank movement — read this before trusting a number.** Average
spots gained by opponent rank is *confounded*: teams that beat weak
opponents are themselves mid-table, and the middle of the board is bunched,
so a tiny rating change buys many places there. It appeared to show a
severe inversion (2.91 spots for beating a top-10 team vs 8.24 for a
#81-138 team) that largely vanished once controlled. Always measure within
a winner rank band. Even then, band sizes are 20–70 games and strict
monotonicity flips on a 0.015 tier change — do not tune toward it.

## Weekly pick reminders

`lib/reminders.ts` (pure decision logic), `lib/email.ts` (Resend REST +
templates), `lib/sendReminders.ts` (the run), folded into the existing
`/api/cron/sync-results` rather than taking a second Hobby cron slot.

**Two providers**, chosen by whichever key is set (`BREVO_API_KEY` wins over
`RESEND_API_KEY`). They differ on who may be emailed: Resend needs a
verified **domain** before it will deliver to anyone but the account owner —
a hard stop without one — while Brevo verifies a single **sender address**.
That distinction is the whole reason the layer is provider-agnostic; don't
collapse it back to one vendor.

**Sending requires TWO switches**: a provider key *and*
`EMAIL_REMINDERS_ENABLED === "true"`. A key alone is exactly what gets
pasted in to "see if it works", and would otherwise immediately mail every
real person in the database. Without both, the path runs fully and reports
who *would* be mailed — that is the test harness.

- `email_sends` is unique on (user, season, week, kind); only rows with
  `error IS NULL` count as sent, so failures retry and successes never
  repeat. This is the real double-send guard, not the app logic.
- Timing is shaped by the cron, not preference: **Hobby cron is daily**, so
  a literal "6 hours before" reminder would never fire for most weeks. "Last
  call" means the last scheduled run before lock (within 24h).
- Every mail carries a no-sign-in unsubscribe link (`/api/unsubscribe`).
  There is **no re-subscribe UI** — the unsubscribe page says so rather than
  promising one. Adding a toggle is the obvious follow-up.
- `backfillUnsubscribeTokens` generates in Node: `gen_random_bytes` needs
  pgcrypto, which this database does not have.

## Rankings are already live — there is nothing to schedule

Standings and rankings are **computed on read** from the latest picks and
results, so they reflect the current state on every page load. A cron to
"update the rankings" would have nothing to do. The daily cron's job is
pulling real scores from CFBD; the rankings follow from that automatically.

Ranks shown beside team names on the week page come from that user's own
Computer Rankings, and only inside the top 25 (`RANKED_CUTOFF`) — "#131"
beside a name is noise. Cost is ~10ms for the ranking itself.

## Default picks (`lib/defaultPick.ts`)

**Two passes, and the automatic one is the point.**

1. **Automatic, on opening a week**: games the rank gap calls *settled*
   (`SETTLED_GAP = 35`) fill themselves, so you land on a week with the
   blowouts already decided and only real decisions left. Roughly 64% of a
   week — week 1 goes from 91 picks to 15. Never in a locked week, never
   over an existing pick, and a no-op on re-open. Wrapped in try/catch: a
   failure here must not stop someone reaching their picks.
2. **"Fill N with favorites"**, on request, for the close games that remain.

Close games are never decided for someone without them asking — that is the
whole difference between the two passes. A banner on the week page explains
why games arrive pre-filled; without it this is just picks appearing from
nowhere.

**Fills from LIVE Computer Rankings, falling back to the preseason poll.**
It must agree with what the page shows — the week page prints live ranks
beside team names, and filling from the August poll made the suggestion
contradict the number next to it (LSU shown #17 against Texas A&M #11, fill
choosing LSU; nine games in one week disagreed). A default that argues with
the screen is worse than none, because now you have to check its work.

**Use the RANK GAP, not "is this an important game".** Measured
against 260 real games with 4+ pickers, the favourite by preseason rank
matched the pool majority 93% of the time, and agreement tracks the gap:

| gap | games | matched majority |
| --- | --- | --- |
| 70+ | 133 | 100% |
| 35-69 | 54 | 96% |
| 15-34 | 44 | 84% |
| 0-14 | 29 | 72% |

`SETTLED_GAP = 35` comes from that table. "Top-50 involved" was the obvious
filter and is worse — it proxies *interest*, while the gap proxies *how
settled the answer is*, which is what decides whether a pick is worth
making.

**The margin default is much weaker than the winner** — it matched the
modal bucket only 44% of the time (chance is 25%). Fine as a starting point,
not an answer. That asymmetry is why filling is something a person asks for
rather than something that happens automatically.

Counterintuitive finding worth keeping: **the "boring" games are where this
pool disagrees most.** G6-vs-G6 games were unanimous only 22% of the time
against 60% for top-25 matchups, so filtering by apparent importance would
remove the games that actually separate people on the leaderboard.

## Clearing picks

`predictions.is_default` records where a pick came from. Without it a filled
default and a decision are identical rows and nothing can tell them apart.

- `fillWeekDefaults` writes `is_default = TRUE`; `savePrediction` always
  writes `FALSE`, **including on conflict** — choosing a game by hand
  promotes it out of "default" even when the value is unchanged, because the
  point is that someone looked at it.
- Clear week offers both when a week holds each kind: "Just my N" keeps the
  filled defaults, "All N" takes everything. With no defaults present it is
  the single question it always was.
- The header says how many picks are still untouched defaults. A week can
  otherwise read as finished while most of it was never considered.
- Existing picks all backfilled to `FALSE`, so nobody's real work is
  mislabelled as a formality.

One game: the Clear button on `GamePicker`. A whole week:
`ClearWeekButton`, behind a confirm naming how many picks are at risk (it
can destroy 91, and there is no cheap way back).

One game: the Clear button on `GamePicker`. A whole week:
`ClearWeekButton` in the week header, behind a confirm step naming how many
picks are at risk (it can destroy 91, and there is no cheap way back).

**The lock is enforced in `clearWeekPredictions`, not in the UI** — a
locked week refuses server-side, so a stale page or hand-rolled post cannot
wipe and re-pick a week whose results are already known. The button is also
hidden on a locked week, because a control that can only fail is worse than
no control. Clearing a week drops its `week_submissions` row too; an empty
week is not a complete one and must stop counting toward the rankings.

## Testing something destructive against the real database

There is no seed/test database — verification runs against real user data.
The pattern that works: **snapshot, act, assert, restore in a `finally`**,
then assert the restore. Used for clear-week (71 picks removed and put
back), for injected real scores when checking leaderboard margins, and for
staging a week-16 result. Always confirm the restore explicitly rather than
trusting the `finally` ran — and prefer a user with partial data (34, 42,
43) over users 1 and 27, whose complete seasons back most invariants.

## Compare Picks (/compare)

Week grid of everyone's picks. **Not gated on the week lock** — the user
decided picks need not be secret before kickoff, so don't reintroduce a
gate without asking. Selection lives in the URL (`?week=&who=&who=`) via a
plain GET form, so the page stays server-rendered and a comparison is
shareable.

- Columns are the people you tick; **consensus counts the whole pool**, so
  "8 of 9 took Oregon" means the same thing however you filter.
- Exactly two selected adds a head-to-head agreement rate; more or fewer
  hides it, because it only reads as a comparison between two.
- **Week 16 is excluded and must stay so**: those games are derived per
  user, so two people's title games are different matchups with nothing to
  line up.
- Team abbreviations: initials for multi-word names, first four letters for
  single-word ones. Pure initials turned "Rutgers" into "R".
- **Capped at 5 people (`MAX_COMPARE`).** A layout constraint, not a
  preference: past five columns the table stopped fitting and fell back to a
  horizontal scrollbar which, on a page of 91 rows, sits at the very bottom
  where nobody finds it. `ComparePeoplePicker` disables the remaining
  checkboxes once the cap is reached, and the server slices to it as well, so
  a hand-edited URL cannot exceed it.
- **Matchup and consensus share one table cell.** Two wide columns for what
  is really one piece of context was most of why the table did not fit. With
  that merge plus `table-fixed`, five people fit in 990px with no overflow —
  the desktop wrapper no longer needs `overflow-x-auto` at all.
- **Two layouts, one row model.** Phones get a card per game (matchup,
  consensus, then each person's pick stacked); `sm:` and up get the table.
  A single `rows` array feeds both so the numbers cannot drift. The table
  alone was wrong on a phone: the Game column is wider than the screen, so
  the pick columns sat entirely offscreen and you lost the matchup while
  scrolling to them.

## Champion banner (/bracket)

Once every bracket slot has a pick, `components/ChampionBanner.tsx`
replaces the page heading with the school, its mascot and its mark at full
size, in that school's own colours. It doubles as the "you are finished"
state — there is no other one.

`teams.mascot`, `teams.color` and `teams.alt_color` come from CFBD
(`scripts/backfill-team-details.mjs` fills them for an existing database;
`seed:teams` keeps them current). All 136 FBS teams have all three. They
are nullable because the ~100 non-FBS opponents auto-created from a
schedule have no CFBD record — a champion always has them, but the
component still falls back to gold.

Two things that are easy to get wrong here, both verified in a browser
against real teams rather than reasoned about:

- **The logo plate must stay dark.** `pickLogoUrl` stores the
  "logos-dark" variant, which is the artwork drawn FOR dark backgrounds
  (Ohio State's sets the wordmark in white). Side by side against a cream
  plate, every mark still read on dark while the white wordmarks all but
  vanished on cream.
- **Team colours cannot be trusted as a text background.** Primaries run
  from \#231f20 to \#ffc72c. The banner computes WCAG luminance and flips
  the ink to near-black above 0.45, so Southern Miss and Arizona State are
  readable rather than white-on-gold.

The logo loads eagerly (`TeamLogo eager`). It is the largest element on
the page, and the default lazy behaviour left it blank on arrival — which
looked exactly like a broken image and cost a wrong diagnosis once already.

## Logo and favicon

- `app/icon.svg` — the tab icon. Next generates the `<link rel="icon">` from
  the filename; there is no config. The old default `app/favicon.ico` was
  **deleted**, because leaving it meant anything preferring `.ico` kept
  showing the stale Next placeholder.
- `public/logo-mark.svg` — the **simplified** mark, used in the header at
  22px. Use this anywhere small.
- `public/logo.svg` — the **detailed** artwork (gradients, glass highlight,
  sparkle), used on the sign-in page at 72px and About at 64px. Its details
  are roughly one pixel at tab size and turn to mush, which is why the tab
  and header use the simplified file instead.

Plain `<img>` with a documented eslint disable, matching `TeamLogo`: a local
static SVG gives the image optimiser nothing to do and costs a function call.

## About / Privacy / Report

Footer links on every page. `/about` and `/privacy` are **public** (see the
`isPublicPage` check in `proxy.ts`) — a privacy policy you must hand over an
account to read is not a disclosure, and Google's OAuth consent screen wants
a reachable link. `/report` stays behind auth so the sender's identity comes
from the session.

**The privacy policy describes what the code actually does** — the tables in
`lib/db/schema.sql` and the services in `lib/`. If storage or third parties
change, that page changes with it. A policy that has drifted from the code is
worse than none, because it is a confident statement that happens to be false.

Reports email `REPORT_TO` (falling back to `EMAIL_FROM`) through the same
provider layer as reminders, with reply-to set to the reporter.

## Security rules that must not regress

- **Service-route guards fail CLOSED.** `if (!process.env.SECRET || mismatch)`,
  never `if (process.env.SECRET && mismatch)`. The second form means an
  environment *without* the secret has no guard at all — and Vercel env vars
  are scoped per environment, so Preview had neither `ADMIN_SECRET` nor
  `CRON_SECRET`. `/api/admin/test-email` sends mail to any address it is
  given, which made that an open relay rather than a missing check.
- **`savePrediction` scopes the game to the caller** (`user_id IS NULL OR
  user_id = $user`). Week 16 rows are per-user, so without it a crafted post
  could attach a pick to someone else's derived championship game.
- **`callbackUrl` needs more than `startsWith("/")`.** `//evil.com` starts
  with a slash and browsers read it as protocol-relative, so that check alone
  is an open redirect straight off the sign-in page.

## Landmines

- **Never run `next build` while `next dev` is running.** It corrupts
  `.next/dev/types`, producing 404s and hydration failures. Fix:
  `rm -rf .next`, then run them sequentially.
- **`GamePicker` must re-sync when the SERVER's pick changes underneath it.**
  `useState(initialWinnerTeamId)` reads its argument only at mount, which is
  fine while a picker is the only thing editing its own game — and wrong the
  moment "Fill with favorites" writes picks for dozens of already-mounted
  pickers. They kept rendering their mount-time `null` while the database
  said otherwise: the week counted complete, Clear week appeared, and not one
  button looked selected. Fixed with React's adjust-state-during-render
  pattern (not an effect, not a changing `key`, which would remount every
  picker on every save). Don't remove it.
- **React 19 resets a form after a server action completes**, wiping the DOM
  state of controlled radios. `GamePicker` therefore uses plain buttons
  writing to hidden inputs, which are immune. Do not "simplify" it back.
- **Never defer a write behind `requestAnimationFrame`.** `GamePicker` used
  to schedule its save that way (to let React commit the hidden inputs
  first). rAF does not fire in a hidden or heavily throttled page, so on
  mobile Chrome a pick's save could be dropped outright, or fire much later
  against whatever the DOM held by then — clearing a pick and finding it
  back after a refresh. Reproduced exactly: with the browser pane hidden the
  old code never issued the save at all, while the current code writes
  correctly under the same conditions. Writes now call the server action
  directly with values taken from the click, never read back out of the DOM,
  and are serialized through a promise chain so the server sees clicks in
  click order even when the network would not.
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
