-- Tương đương với django/lmsictu/migrations/ (0001 → 0011)
-- Chạy bằng: wrangler d1 execute lmsictu --file=migrations/0001_initial.sql

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_profile (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subject (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(creator_id, name)
);

CREATE TABLE IF NOT EXISTS week (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  topics     TEXT NOT NULL DEFAULT '[]',  -- JSON array
  link       TEXT NOT NULL DEFAULT '',
  quiz_code  TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  code                     TEXT NOT NULL UNIQUE,
  title                    TEXT NOT NULL DEFAULT '',
  subject                  TEXT NOT NULL DEFAULT '',
  week_index               INTEGER,
  is_active                INTEGER NOT NULL DEFAULT 1,
  creator_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
  questions                TEXT NOT NULL DEFAULT '[]',  -- JSON array
  duration_seconds         INTEGER NOT NULL DEFAULT 1800,
  has_key_username         INTEGER NOT NULL DEFAULT 0,
  key_usernames            TEXT NOT NULL DEFAULT '[]',  -- JSON array
  auto_shuffle             INTEGER NOT NULL DEFAULT 1,
  show_answers_immediately INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_code ON quiz(code);
CREATE INDEX IF NOT EXISTS idx_quiz_week ON quiz(subject, week_index);

CREATE TABLE IF NOT EXISTS attempt (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      INTEGER NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  session_key  TEXT NOT NULL DEFAULT '',
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  answers      TEXT NOT NULL DEFAULT '{}',   -- JSON object
  results      TEXT NOT NULL DEFAULT '[]',   -- JSON array
  score        REAL,
  total        INTEGER NOT NULL DEFAULT 0,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT
);
