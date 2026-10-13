import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Db = Database.Database

/** Opens (or creates) the SQLite database and makes sure the tables exist. Pass ':memory:' for tests. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    -- Finished games (PRD 6장 Score). Every play is kept, including repeats by the same nickname.
    CREATE TABLE IF NOT EXISTS scores (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname            TEXT    NOT NULL,
      score               INTEGER NOT NULL CHECK (score BETWEEN 0 AND 400),
      correct_by_category TEXT    NOT NULL,
      duration_sec        INTEGER NOT NULL CHECK (duration_sec >= 0),
      played_at           TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scores_ranking ON scores (score DESC, duration_sec ASC, played_at ASC);

    -- Games in progress (and recently finished, so a retried finish returns the same result).
    -- Rows older than 24 hours are deleted by cleanup.ts; unfinished games never reach scores.
    CREATE TABLE IF NOT EXISTS games (
      id         TEXT    PRIMARY KEY,
      nickname   TEXT    NOT NULL,
      plan       TEXT    NOT NULL,             -- JSON: [{questionId, choiceOrder}]
      answers    TEXT    NOT NULL DEFAULT '[]', -- JSON: [{questionId, choiceIndex, correct, answeredAt}]
      started_at INTEGER NOT NULL,             -- ms since epoch
      score_id   INTEGER REFERENCES scores (id) ON DELETE SET NULL,
      finished   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS games_started_at ON games (started_at);

    -- Teacher login sessions. Only a SHA-256 hash of the cookie token is stored, never the token itself.
    -- expires_at moves forward on every teacher request (idle timeout); expired rows are deleted by cleanup.
    CREATE TABLE IF NOT EXISTS teacher_sessions (
      token_hash TEXT    PRIMARY KEY,
      created_at INTEGER NOT NULL,             -- ms since epoch
      expires_at INTEGER NOT NULL              -- ms since epoch
    );
  `)
  return db
}
