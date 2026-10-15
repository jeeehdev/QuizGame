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

    -- Per-question results of a finished game, kept as long as its score (deleted with it).
    -- Only what the teacher's weakness analysis needs: no chosen choice, no timestamps.
    CREATE TABLE IF NOT EXISTS score_answers (
      score_id    INTEGER NOT NULL REFERENCES scores (id) ON DELETE CASCADE,
      position    INTEGER NOT NULL,             -- 0-based order in which the question was asked
      question_id TEXT    NOT NULL,
      correct     INTEGER NOT NULL CHECK (correct IN (0, 1)),
      PRIMARY KEY (score_id, position)
    );

    -- Teacher login sessions. Only a SHA-256 hash of the cookie token is stored, never the token itself.
    -- expires_at moves forward on every teacher request (idle timeout); expired rows are deleted by cleanup.
    CREATE TABLE IF NOT EXISTS teacher_sessions (
      token_hash TEXT    PRIMARY KEY,
      created_at INTEGER NOT NULL,             -- ms since epoch
      expires_at INTEGER NOT NULL              -- ms since epoch
    );

    -- Teacher mode settings, e.g. key 'class_name'.
    CREATE TABLE IF NOT EXISTS teacher_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Class roster. Scores are linked to students only through nicknames, so removing a student keeps the scores.
    CREATE TABLE IF NOT EXISTS students (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE CHECK (number > 0),   -- 출석 번호
      name   TEXT    NOT NULL
    );
    -- A nickname belongs to at most one student.
    CREATE TABLE IF NOT EXISTS student_nicknames (
      nickname   TEXT    PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS student_nicknames_student ON student_nicknames (student_id);
  `)
  // Games finished before score_answers existed still have their answers in games for 24 hours; copy them once.
  db.exec(`
    INSERT OR IGNORE INTO score_answers (score_id, position, question_id, correct)
    SELECT g.score_id, CAST(a.key AS INTEGER), json_extract(a.value, '$.questionId'),
           CASE WHEN json_extract(a.value, '$.correct') THEN 1 ELSE 0 END
    FROM games g, json_each(g.answers) a
    WHERE g.finished = 1 AND g.score_id IN (SELECT id FROM scores)
      AND NOT EXISTS (SELECT 1 FROM score_answers s WHERE s.score_id = g.score_id)
  `)
  return db
}
