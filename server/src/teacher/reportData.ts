// Reads what the teacher report needs from the database. Only SELECTs, so it also works on a read-only connection.
import type { QuizQuestion, ReportPeriod, TeacherReport } from '../../../shared/types.ts'
import type { Db } from '../db.ts'
import { getClassName, listStudents } from '../roster.ts'
import { buildReport, RECENT_ANSWERS_MS, type CompareRequest, type InputGame, type InputScore, type ReportInput } from './report.ts'

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
    .all(period.from ?? '', period.to ?? '￿') as ScoreRow[]
  const scores: InputScore[] = rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    score: r.score,
    correctByCategory: JSON.parse(r.correct_by_category),
    durationSec: r.duration_sec,
    playedAt: r.played_at,
  }))

  // games rows are deleted 24 hours after they start, but cleanup runs hourly, so the cut is applied here too.
  const since = now - RECENT_ANSWERS_MS
  const games = db
    .prepare(
      `SELECT g.score_id, s.nickname, s.played_at, s.duration_sec, g.answers FROM games g
       JOIN scores s ON s.id = g.score_id
       WHERE g.finished = 1 AND g.started_at >= ?`,
    )
    .all(since) as { score_id: number; nickname: string; played_at: string; duration_sec: number; answers: string }[]
  const recentGames: InputGame[] = games.map((g) => ({
    scoreId: g.score_id,
    nickname: g.nickname,
    playedAt: g.played_at,
    durationSec: g.duration_sec,
    answers: (JSON.parse(g.answers) as { questionId: string; correct: boolean }[]).map(({ questionId, correct }) => ({
      questionId,
      correct,
    })),
  }))
  const abandoned = db
    .prepare('SELECT nickname FROM games WHERE finished = 0 AND started_at >= ?')
    .all(since) as { nickname: string }[]

  return {
    className: getClassName(db),
    period,
    now,
    students: listStudents(db).map(({ id, number, name, nicknames }) => ({ id, number, name, nicknames })),
    scores,
    recentGames,
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
