// Teacher API for saved records: list and search them, and delete one (same as npm run delete-score).
// Mounted after requireTeacher (teacherAuth.ts), so every route needs a session.
import { Router } from 'express'
import type { TeacherScoreEntry, TeacherScoresResponse } from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import type { Db } from './db.ts'
import { deleteScore } from './scoreQueries.ts'
import { FAST_RECORD_SEC } from './teacher/report.ts'

export const SCORES_LIST_LIMIT = 100

interface EntryRow {
  id: number
  nickname: string
  score: number
  duration_sec: number
  played_at: string
  number: number | null
  name: string | null
}

const SELECT_ENTRIES = `
  FROM scores s
  LEFT JOIN student_nicknames n ON n.nickname = s.nickname
  LEFT JOIN students st ON st.id = n.student_id
  WHERE (@query = '' OR s.nickname LIKE @pattern ESCAPE '\\' OR st.name LIKE @pattern ESCAPE '\\')
    AND (@fast = 0 OR s.duration_sec < @fastSec)
`

function toEntry(row: EntryRow): TeacherScoreEntry {
  return {
    id: row.id,
    nickname: row.nickname,
    student: row.number === null ? null : { number: row.number, name: row.name! },
    score: row.score,
    durationSec: row.duration_sec,
    playedAt: row.played_at,
    fast: row.duration_sec < FAST_RECORD_SEC,
  }
}

/** Records whose nickname or student name contains `query`, newest first. `fast` keeps only ⏱️ records. */
export function listScores(db: Db, { query = '', fast = false, limit = SCORES_LIST_LIMIT } = {}): TeacherScoresResponse {
  const params = {
    query,
    pattern: `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    fast: fast ? 1 : 0,
    fastSec: FAST_RECORD_SEC,
  }
  const rows = db
    .prepare(
      `SELECT s.id, s.nickname, s.score, s.duration_sec, s.played_at, st.number, st.name ${SELECT_ENTRIES}
       ORDER BY s.played_at DESC, s.id DESC LIMIT @limit`,
    )
    .all({ ...params, limit }) as EntryRow[]
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${SELECT_ENTRIES}`).get(params) as { total: number }
  return { entries: rows.map(toEntry), total }
}

export function createTeacherScoresRouter({ db }: { db: Db }) {
  const router = Router()

  router.get('/scores', (req, res) => {
    const { q, fast } = req.query
    if ((q !== undefined && typeof q !== 'string') || (fast !== undefined && typeof fast !== 'string')) {
      return sendError(res, 400, 'INVALID_REQUEST', '요청 형식이 올바르지 않습니다.')
    }
    res.json(listScores(db, { query: (q ?? '').trim(), fast: fast === '1' }) satisfies TeacherScoresResponse)
  })

  router.delete('/scores/:id', (req, res) => {
    const id = Number(req.params.id)
    const row = Number.isInteger(id) && id > 0
      ? (db
          .prepare(`SELECT s.id, s.nickname, s.score, s.duration_sec, s.played_at, st.number, st.name ${SELECT_ENTRIES} AND s.id = @id`)
          .get({ query: '', pattern: '', fast: 0, fastSec: FAST_RECORD_SEC, id }) as EntryRow | undefined)
      : undefined
    if (!row || !deleteScore(db, id)) return sendError(res, 404, 'NOT_FOUND', '이미 지워졌거나 없는 기록입니다.')
    console.log(`Teacher deleted score #${row.id} (${row.nickname} ${row.score}점, ${row.played_at})`)
    res.json(toEntry(row) satisfies TeacherScoreEntry)
  })

  return router
}
