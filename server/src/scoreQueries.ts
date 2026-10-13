// Every query that saves or ranks scores lives here, so the ranking policy can change in one place.
// Current policy: every finished game is a separate entry (the same nickname can appear many times),
// ranked by score (high first), then duration (fast first). Equal score and duration share a rank.
// To switch to "best record per nickname" or a period-based board, change RANKED_SCORES below.
import type { Category, GameResult, LeaderboardEntry } from '../../shared/types.ts'
import type { Db } from './db.ts'

const RANK_ORDER = 'score DESC, duration_sec ASC'
/** Display order: ties are listed oldest first. */
const LIST_ORDER = `${RANK_ORDER}, played_at ASC, id ASC`

const RANKED_SCORES = `
  SELECT id, nickname, score, duration_sec, played_at,
         RANK() OVER (ORDER BY ${RANK_ORDER}) AS rank
  FROM scores
`

interface RankedRow {
  id: number
  nickname: string
  score: number
  duration_sec: number
  played_at: string
  rank: number
}

function toEntry(row: RankedRow): LeaderboardEntry {
  return {
    id: row.id,
    rank: row.rank,
    nickname: row.nickname,
    score: row.score,
    durationSec: row.duration_sec,
    playedAt: row.played_at,
  }
}

export function insertScore(db: Db, result: GameResult, playedAt: Date): number {
  const info = db
    .prepare(
      `INSERT INTO scores (nickname, score, correct_by_category, duration_sec, played_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(result.nickname, result.score, JSON.stringify(result.correctByCategory), result.durationSec, playedAt.toISOString())
  return Number(info.lastInsertRowid)
}

export function getLeaderboard(db: Db, limit: number): LeaderboardEntry[] {
  const rows = db.prepare(`${RANKED_SCORES} ORDER BY ${LIST_ORDER} LIMIT ?`).all(limit) as RankedRow[]
  return rows.map(toEntry)
}

/** The rank of one saved score, or null when it does not exist (e.g. deleted). */
export function getRank(db: Db, scoreId: number): number | null {
  const row = db.prepare(`SELECT rank FROM (${RANKED_SCORES}) WHERE id = ?`).get(scoreId) as { rank: number } | undefined
  return row?.rank ?? null
}

export interface StoredScore {
  id: number
  nickname: string
  score: number
  correctByCategory: Record<Category, number>
  durationSec: number
  playedAt: string
}

export function getScore(db: Db, scoreId: number): StoredScore | null {
  const row = db.prepare('SELECT * FROM scores WHERE id = ?').get(scoreId) as
    | (Omit<RankedRow, 'rank'> & { correct_by_category: string })
    | undefined
  if (!row) return null
  return {
    id: row.id,
    nickname: row.nickname,
    score: row.score,
    correctByCategory: JSON.parse(row.correct_by_category),
    durationSec: row.duration_sec,
    playedAt: row.played_at,
  }
}

/** Returns true when a score was deleted. */
export function deleteScore(db: Db, scoreId: number): boolean {
  return db.prepare('DELETE FROM scores WHERE id = ?').run(scoreId).changes > 0
}
