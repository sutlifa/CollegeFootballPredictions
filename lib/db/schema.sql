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
  week                        INTEGER NOT NULL CHECK (week BETWEEN 1 AND 16),
  team1_id                    INTEGER NOT NULL REFERENCES teams(id),
  team2_id                    INTEGER NOT NULL REFERENCES teams(id),
  team1_is_home               BOOLEAN,
  is_neutral_site             BOOLEAN NOT NULL DEFAULT FALSE,
  conference                  TEXT,
  is_conference_championship  BOOLEAN NOT NULL DEFAULT FALSE,
  kickoff_at                  TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS predictions (
  id                     SERIAL PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id                INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  predicted_score_team1  INTEGER NOT NULL,
  predicted_score_team2  INTEGER NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
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
