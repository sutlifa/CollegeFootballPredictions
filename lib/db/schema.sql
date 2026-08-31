CREATE TABLE IF NOT EXISTS teams (
  id              SERIAL PRIMARY KEY,
  cfbd_team_id    INTEGER UNIQUE,
  name            TEXT NOT NULL UNIQUE,
  conference      TEXT NOT NULL,       -- includes 'FCS' for non-FBS opponents
  preseason_rank  INTEGER,
  logo_url        TEXT,
  is_fbs          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  google_id   TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  image       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Games are the shared schedule + real results (weeks 1-15 from CFBD).
-- Week 16 (conference championship) rows are derived per-user -- since
-- each user's own predictions determine their conference standings, two
-- users can derive different championship matchups. `user_id` is NULL for
-- shared games and set to the owning user for a per-user Week 16 row.
-- Predicted scores live in `predictions`, not here -- actual results and
-- schedule metadata are the same for everyone regardless of user_id.
CREATE TABLE IF NOT EXISTS games (
  id                          SERIAL PRIMARY KEY,
  cfbd_game_id                TEXT UNIQUE,
  season                      INTEGER NOT NULL DEFAULT 2026,
  week                        INTEGER NOT NULL CHECK (week BETWEEN 0 AND 16),
  team1_id                    INTEGER NOT NULL REFERENCES teams(id),
  team2_id                    INTEGER NOT NULL REFERENCES teams(id),
  team1_is_home               BOOLEAN,
  is_neutral_site             BOOLEAN NOT NULL DEFAULT FALSE,
  conference                  TEXT,
  is_conference_championship  BOOLEAN NOT NULL DEFAULT FALSE,
  kickoff_at                  TIMESTAMPTZ,
  -- CFBD has not published a real start time yet; kickoff_at holds its
  -- placeholder (midnight ET of the intended day), so show the date only.
  kickoff_tbd                 BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'scheduled',
  actual_score_team1          INTEGER,
  actual_score_team2          INTEGER,
  user_id                     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two partial unique indexes instead of one UNIQUE constraint: a plain
-- UNIQUE(season,week,team1_id,team2_id,user_id) wouldn't actually dedupe
-- shared rows, since Postgres treats every NULL as distinct from every
-- other NULL for uniqueness purposes.
CREATE UNIQUE INDEX IF NOT EXISTS games_shared_unique
  ON games (season, week, team1_id, team2_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS games_peruser_unique
  ON games (season, week, team1_id, team2_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS games_week_idx ON games (season, week);
CREATE INDEX IF NOT EXISTS games_user_idx ON games (user_id);

-- A prediction is "who wins, and by roughly how much" -- a winner plus one
-- of four margin buckets (see lib/margin.ts), not an exact final score.
-- Exact scores were the original input and turned out to be far too much
-- work to enter for a whole season; nothing downstream ever used the raw
-- points anyway, only the margin between them.
CREATE TABLE IF NOT EXISTS predictions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  winner_team_id  INTEGER NOT NULL REFERENCES teams(id),
  margin_bucket   SMALLINT NOT NULL CHECK (margin_bucket BETWEEN 0 AND 3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id             SERIAL PRIMARY KEY,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  weeks_checked  INTEGER[],
  games_updated  INTEGER NOT NULL DEFAULT 0,
  error          TEXT
);

CREATE TABLE IF NOT EXISTS bracket_field (
  season      INTEGER NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_ids    INTEGER[] NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, user_id)
);

-- One row per bracket game the user has picked a winner for. `slot`
-- identifies which game in the fixed 12-team bracket tree (see
-- lib/bracket.ts BracketSlot) -- e.g. 'r1_5v12', 'qf_1', 'sf_1',
-- 'championship'. Saving a pick for a slot deletes any picks already
-- stored for slots downstream of it (later rounds that depended on the
-- old pick), so a changed earlier-round pick can't leave a stale
-- now-impossible matchup on the books.
CREATE TABLE IF NOT EXISTS bracket_picks (
  season      INTEGER NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, user_id, slot)
);

-- A week only counts toward Computer Rankings once the user explicitly
-- submits it (all of that week's games must have a prediction first).
-- Editing a prediction in an already-submitted week deletes its row here,
-- so the change doesn't silently leak into the rankings until resubmitted.
CREATE TABLE IF NOT EXISTS week_submissions (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season        INTEGER NOT NULL,
  week          INTEGER NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season, week)
);

-- Real-world postseason ground truth, entered by the site admin as results
-- become known -- there's no API for an actual human selection committee's
-- decisions, so this can't be auto-ingested the way weeks 1-15 are. Used
-- only for the Leaderboard's end-of-season bonus scoring; never shown as a
-- game users predict against.
CREATE TABLE IF NOT EXISTS real_conference_results (
  season             INTEGER NOT NULL,
  conference         TEXT NOT NULL,
  champion_team_id   INTEGER NOT NULL REFERENCES teams(id),
  runner_up_team_id  INTEGER NOT NULL REFERENCES teams(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, conference)
);

-- team_ids per checkpoint: 'field' = the real 12-team playoff field,
-- 'quarterfinal'/'semifinal'/'championship' = whoever advanced INTO that
-- round (8, 4, 2 teams respectively).
CREATE TABLE IF NOT EXISTS real_playoff_rounds (
  season      INTEGER NOT NULL,
  round       TEXT NOT NULL CHECK (round IN ('field', 'quarterfinal', 'semifinal', 'championship')),
  team_ids    INTEGER[] NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, round)
);

CREATE TABLE IF NOT EXISTS real_national_champion (
  season      INTEGER PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The final, tiebreaker-resolved conference standings order (team_ids in
-- rank order), computed once per user/season/conference -- not recomputed
-- on every page view. Each conference's real tiebreaker procedure (a
-- head-to-head sweep, then common-conference-opponents win percentage,
-- then further conference-specific steps) only means something once the
-- full regular season is in, so this is only ever written once, right
-- after that user has submitted every regular-season week (0 through the
-- Army-Navy week). Cleared out (see clearFinalConferenceStandings) if a
-- prediction edit un-submits any of those weeks, so a stale order can
-- never linger past the data it was computed from.
-- `division` is 'ALL' for every conference except the Sun Belt, which is
-- the one FBS conference that still splits into East/West divisions (its
-- championship is division champ vs division champ, not top-2 overall) --
-- 'ALL' rather than NULL so the primary key behaves normally (Postgres
-- treats every NULL as distinct from every other NULL for uniqueness).
CREATE TABLE IF NOT EXISTS conference_final_standings (
  season       INTEGER NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conference   TEXT NOT NULL,
  division     TEXT NOT NULL DEFAULT 'ALL',
  team_ids     INTEGER[] NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, user_id, conference, division)
);

-- Weekly pick reminders. Opt-out lives on the user; email_sends is the
-- at-most-once ledger, so a cron that runs twice or retries after a partial
-- failure can never mail the same person about the same week twice.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_reminders BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS email_sends (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season     INTEGER NOT NULL,
  week       INTEGER NOT NULL,
  -- 'nudge' (a couple of days out) or 'last_call' (final run before lock).
  kind       TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Null on success; the provider's message for a failed attempt.
  error      TEXT,
  UNIQUE (user_id, season, week, kind)
);
