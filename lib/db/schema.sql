CREATE TABLE IF NOT EXISTS teams (
  id              SERIAL PRIMARY KEY,
  espn_team_id    INTEGER UNIQUE,
  name            TEXT NOT NULL UNIQUE,
  conference      TEXT NOT NULL,       -- includes 'FCS' for non-FBS opponents
  preseason_rank  INTEGER,
  is_fbs          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id                          SERIAL PRIMARY KEY,
  espn_event_id               TEXT UNIQUE,
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
  predicted_score_team1       INTEGER,
  predicted_score_team2       INTEGER,
  actual_score_team1          INTEGER,
  actual_score_team2          INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season, week, team1_id, team2_id)
);

CREATE INDEX IF NOT EXISTS games_week_idx ON games (season, week);

CREATE TABLE IF NOT EXISTS sync_runs (
  id             SERIAL PRIMARY KEY,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  weeks_checked  INTEGER[],
  games_updated  INTEGER NOT NULL DEFAULT 0,
  error          TEXT
);

CREATE TABLE IF NOT EXISTS bracket_field (
  season      INTEGER PRIMARY KEY,
  team_ids    INTEGER[] NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
