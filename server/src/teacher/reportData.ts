// Reads what the teacher report needs from the database. Only SELECTs, so it also works on a read-only connection.
import type { QuizQuestion, ReportPeriod, TeacherReport } from '../../../shared/types.ts'
import type { Db } from '../db.ts'
import { getClassName, listStudents } from '../roster.ts'
import { buildReport, ABANDONED_WINDOW_MS, type CompareRequest, type InputGame, type InputScore, type ReportInput } from './report.ts'

/** Upper bound for `all`: sorts after every played_at ISO string. */
const AFTER_ANY_DATE = String.fromCharCode(0xffff)

interface ScoreRow {
  id: number
  nickname: string
  score: number
  correct_by_category: string
  duration_sec: number
  played_at: string
}

export function loadReportInput(
  db: Db,
  period: ReportPeriod,
  now: number,
  questions: ReadonlyMap<string, QuizQuestion>,
): ReportInput {
  const rows = db
    .prepare(
      `SELECT id, nickname, score, correct_by_category, duration_sec, played_at FROM scores
       WHERE played_at >= ? AND played_at < ? ORDER BY played_at, id`,
    )
    .all(period.from ?? '', period.to ?? AFTER_ANY_DATE) as ScoreRow[]
  const scores: InputScore[] = rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    score: r.score,
    correctByCategory: JSON.parse(r.correct_by_category),
    durationSec: r.duration_sec,
    playedAt: r.played_at,
  }))

  // Per-question answers of the same records, grouped by record in the order asked.
  const answerRows = db
    .prepare(
      `SELECT a.score_id, a.question_id, a.correct FROM score_answers a
       JOIN scores s ON s.id = a.score_id
       WHERE s.played_at >= ? AND s.played_at < ? ORDER BY a.score_id, a.position`,
    )
    .all(period.from ?? '', period.to ?? AFTER_ANY_DATE) as { score_id: number; question_id: string; correct: number }[]
  const answersByScore = new Map<number, { questionId: string; correct: boolean }[]>()
  for (const row of answerRows) {
    const list = answersByScore.get(row.score_id) ?? []
    list.push({ questionId: row.question_id, correct: row.correct === 1 })
    answersByScore.set(row.score_id, list)
  }
  const answeredGames: InputGame[] = scores
    .filter((s) => answersByScore.has(s.id))
    .map((s) => ({ scoreId: s.id, nickname: s.nickname, playedAt: s.playedAt, durationSec: s.durationSec, answers: answersByScore.get(s.id)! }))

  // games rows are deleted 24 hours after they start, but cleanup runs hourly, so the cut is applied here too.
  const since = now - ABANDONED_WINDOW_MS
  const abandoned = db
    .prepare('SELECT nickname FROM games WHERE finished = 0 AND started_at >= ?')
    .all(since) as { nickname: string }[]

  return {
    className: getClassName(db),
    period,
    now,
    students: listStudents(db).map(({ id, number, name, nicknames }) => ({ id, number, name, nicknames })),
    scores,
    answeredGames,
    abandonedNicknames: abandoned.map((g) => g.nickname),
    questions,
  }
}

export function getTeacherReport(
  db: Db,
  period: ReportPeriod,
  now: number,
  questions: ReadonlyMap<string, QuizQuestion>,
  compare?: CompareRequest,
): TeacherReport {
  return buildReport(loadReportInput(db, period, now, questions), compare)
}
