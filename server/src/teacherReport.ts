// Teacher API for the class report. Mounted after requireTeacher (teacherAuth.ts), so every route needs a session.
import { Router } from 'express'
import type { QuizQuestion, TeacherReport } from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import type { Db } from './db.ts'
import { parsePeriod, PeriodError } from './teacher/period.ts'
import { ReportError, type CompareRequest } from './teacher/report.ts'
import { getTeacherReport } from './teacher/reportData.ts'

export interface TeacherReportOptions {
  db: Db
  now: () => number
  /** Questions in play and candidates by id, as the running server knows them now. */
  questions: () => ReadonlyMap<string, QuizQuestion>
}

/** "1,3,5" → [1, 3, 5], "all" → 'all'. Null when the value is not a list of 출석 번호. */
export function parseCompare(value: string): CompareRequest | null {
  if (value.trim() === 'all') return 'all'
  const numbers = value.split(',').map((part) => Number(part.trim()))
  return numbers.every((n) => Number.isInteger(n) && n > 0) ? numbers : null
}

export function createTeacherReportRouter({ db, now, questions }: TeacherReportOptions) {
  const router = Router()

  // GET /report?period=7d&compare=1,3,5
  router.get('/report', (req, res) => {
    const { period: periodText, compare: compareText } = req.query
    if ((periodText !== undefined && typeof periodText !== 'string') || (compareText !== undefined && typeof compareText !== 'string')) {
      return sendError(res, 400, 'INVALID_REQUEST', '요청 형식이 올바르지 않습니다.')
    }
    const time = now()
    let period
    try {
      period = parsePeriod(periodText, new Date(time))
    } catch (error) {
      if (error instanceof PeriodError) return sendError(res, 400, 'INVALID_PERIOD', error.message)
      throw error
    }
    const compare = compareText === undefined || compareText === '' ? undefined : parseCompare(compareText)
    if (compare === null) return sendError(res, 400, 'INVALID_REQUEST', '비교할 학생은 출석 번호를 쉼표로 이어 주세요. (예: 1,3,5)')

    try {
      res.json(getTeacherReport(db, period, time, questions(), compare) satisfies TeacherReport)
    } catch (error) {
      if (error instanceof ReportError) return sendError(res, error.status, error.code, error.message)
      throw error
    }
  })

  return router
}
