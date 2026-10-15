// Teacher mode calculations (docs/teacher-mode.md). Pure functions: the data comes in through ReportInput
// (reportData.ts reads it from the database), so the web screens, the CLI and the tests share one set of rules.
import {
  CATEGORIES,
  type Category,
  type CategoryRates,
  type CompareItem,
  type Grade,
  type QuizQuestion,
  type ReportCompare,
  type ReportDay,
  type ReportPeriod,
  type ReportQuestionDetail,
  type ReportRecord,
  type ReportStudent,
  type ReportSummary,
  type ReportWeakness,
  type ReportWrongQuestion,
  type TeacherReport,
  type Trend,
} from '../../../shared/types.ts'
import { localDate } from './period.ts'

/** Records under this many seconds (2 seconds a question) are marked ⏱️. */
export const FAST_RECORD_SEC = 80
export const QUESTIONS_PER_CATEGORY = 10
/** ⚠️⭐ and the standard deviation need this many students who played. */
export const MIN_STUDENTS_FOR_FLAGS = 3
export const MIN_STUDENTS_FOR_GRADES = 5
export const TREND_THRESHOLD = 30
export const DAILY_DAYS = 14
export const WEAK_QUESTION_LIMIT = 10
/** A question's wrong rate is computed only when at least this many students solved it. */
export const MIN_SOLVERS = 3
export const COMPARE_GAP = 20
export const CLOSE_SCORE = 10
export const MAX_COMPARE = 30
/** Unfinished games are counted over this window (games rows are deleted after 24 hours). */
export const ABANDONED_WINDOW_MS = 24 * 60 * 60 * 1000

export interface InputStudent {
  id: number
  number: number
  name: string
  nicknames: string[]
}

export interface InputScore {
  id: number
  nickname: string
  score: number
  correctByCategory: Record<Category, number>
  durationSec: number
  playedAt: string
}

/** A finished game in the period with its per-question answers (score_answers). */
export interface InputGame {
  scoreId: number
  nickname: string
  playedAt: string
  durationSec: number
  answers: { questionId: string; correct: boolean }[]
}

export interface ReportInput {
  className: string
  period: ReportPeriod
  now: number
  students: InputStudent[]
  /** Every finished game in the period, roster or not. */
  scores: InputScore[]
  /** Finished games in the period that have per-question answers. */
  answeredGames: InputGame[]
  /** Nicknames of games started in the last 24 hours and left unfinished. */
  abandonedNicknames: string[]
  /** Questions in play and candidates, by id. */
  questions: ReadonlyMap<string, QuizQuestion>
}

/** Students to compare: 출석 번호, or 'all' for every student who played. Omit for the default choice. */
export type CompareRequest = number[] | 'all'

export class ReportError extends Error {
  readonly code: 'INVALID_REQUEST' | 'STUDENT_NOT_FOUND'
  readonly status: number

  constructor(code: ReportError['code'], message: string) {
    super(message)
    this.name = 'ReportError'
    this.code = code
    this.status = code === 'STUDENT_NOT_FOUND' ? 404 : 400
  }
}

const EPSILON = 1e-9
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const mean = (values: number[]) => sum(values) / values.length

/** Population standard deviation. */
export function stdDev(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** RANK(): 1 + the number of values strictly higher. */
export function rankOf(value: number, values: number[]): number {
  return 1 + values.filter((v) => v > value + EPSILON).length
}

/** Relative grade from the rank: top 20% A, 40% B, 70% C, the rest D. */
export function gradeFor(rank: number, count: number): Grade {
  if (rank * 5 <= count) return 'A'
  if (rank * 5 <= count * 2) return 'B'
  if (rank * 10 <= count * 7) return 'C'
  return 'D'
}

export function trendFor(change: number): Trend {
  if (change >= TREND_THRESHOLD) return 'up'
  if (change <= -TREND_THRESHOLD) return 'down'
  return 'flat'
}

/** Category rates (%) over records: correct answers ÷ (records × 10). */
export function categoryRates(records: Pick<InputScore, 'correctByCategory'>[]): CategoryRates {
  const rates = {} as CategoryRates
  for (const c of CATEGORIES) {
    rates[c] = (sum(records.map((r) => r.correctByCategory[c])) / (records.length * QUESTIONS_PER_CATEGORY)) * 100
  }
  return rates
}

/** Highest and lowest categories, ties included. All four when they are equal (차이 없음). */
export function strongAndWeak(rates: CategoryRates): { strong: Category[]; weak: Category[] } {
  const values = CATEGORIES.map((c) => rates[c])
  const max = Math.max(...values)
  const min = Math.min(...values)
  return {
    strong: CATEGORIES.filter((c) => rates[c] >= max - EPSILON),
    weak: CATEGORIES.filter((c) => rates[c] <= min + EPSILON),
  }
}

function meanRates(list: CategoryRates[]): CategoryRates {
  const rates = {} as CategoryRates
  for (const c of CATEGORIES) rates[c] = mean(list.map((r) => r[c]))
  return rates
}

function rateChange(from: CategoryRates, to: CategoryRates): CategoryRates {
  const change = {} as CategoryRates
  for (const c of CATEGORIES) change[c] = to[c] - from[c]
  return change
}

const byPlayedAt = (a: { playedAt: string; scoreId?: number; id?: number }, b: typeof a) =>
  a.playedAt.localeCompare(b.playedAt) || (a.scoreId ?? a.id ?? 0) - (b.scoreId ?? b.id ?? 0)

/** One student's representative values over their records (oldest first). */
function studentValues(student: InputStudent, records: InputScore[]): ReportStudent {
  const base: ReportStudent = {
    ...student,
    playCount: records.length,
    fastCount: records.filter((r) => r.durationSec < FAST_RECORD_SEC).length,
    best: null,
    average: null,
    recent: null,
    first: null,
    vsClass: null,
    categoryRates: null,
    strongCategories: [],
    weakCategories: [],
    averageDurationSec: null,
    lastPlayedAt: null,
    rank: null,
    grade: null,
    flag: null,
    change: null,
    trend: null,
    categoryChange: null,
    records: records.map((r, i) => ({
      scoreId: r.id,
      nickname: r.nickname,
      playedAt: r.playedAt,
      score: r.score,
      change: i === 0 ? null : r.score - records[i - 1].score,
      correctByCategory: r.correctByCategory,
      durationSec: r.durationSec,
      fast: r.durationSec < FAST_RECORD_SEC,
    }) satisfies ReportRecord),
  }
  if (records.length === 0) return base

  const rates = categoryRates(records)
  const { strong, weak } = strongAndWeak(rates)
  const first = records[0]
  const last = records.at(-1)!
  const window = records.length >= 4 ? 2 : 1
  return {
    ...base,
    best: Math.max(...records.map((r) => r.score)),
    average: mean(records.map((r) => r.score)),
    recent: last.score,
    first: first.score,
    categoryRates: rates,
    strongCategories: strong,
    weakCategories: weak,
    averageDurationSec: mean(records.map((r) => r.durationSec)),
    lastPlayedAt: last.playedAt,
    change: records.length >= 2 ? last.score - first.score : null,
    trend: records.length >= 2 ? trendFor(last.score - first.score) : null,
    categoryChange:
      records.length >= 2
        ? rateChange(categoryRates(records.slice(0, window)), categoryRates(records.slice(-window)))
        : null,
  }
}

/** Gives rank, grade, ⚠️⭐ and the difference from the class average to the students who played. */
function rankStudents(students: ReportStudent[]): Pick<ReportSummary, 'average' | 'stdDev'> {
  const played = students.filter((s) => s.average !== null)
  if (played.length === 0) return { average: null, stdDev: null }
  const averages = played.map((s) => s.average!)
  const classAverage = mean(averages)
  const sd = played.length >= MIN_STUDENTS_FOR_FLAGS ? stdDev(averages) : null
  for (const s of played) {
    s.vsClass = s.average! - classAverage
    s.rank = rankOf(s.average!, averages)
    if (played.length >= MIN_STUDENTS_FOR_GRADES) s.grade = gradeFor(s.rank, played.length)
    // With no spread (sd 0) nobody stands out.
    if (sd !== null && sd > EPSILON) {
      if (s.average! <= classAverage - sd + EPSILON) s.flag = 'warning'
      else if (s.average! >= classAverage + sd - EPSILON) s.flag = 'star'
    }
  }
  return { average: classAverage, stdDev: sd }
}

function summarize(input: ReportInput, students: ReportStudent[], rosterNicknames: Set<string>): ReportSummary {
  const played = students.filter((s) => s.playCount > 0)
  const { average, stdDev: sd } = rankStudents(students)
  const averages = played.map((s) => s.average!)
  const recordCount = sum(students.map((s) => s.playCount))
  const fastCount = sum(students.map((s) => s.fastCount))
  const scoreBands: ReportSummary['scoreBands'] = [0, 0, 0, 0, 0]
  for (const s of played) scoreBands[Math.min(Math.floor(s.best! / 100), 4)]++
  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 }
  for (const s of played) if (s.grade) gradeCounts[s.grade]++
  const topScore = played.length > 0 ? Math.max(...played.map((s) => s.best!)) : null
  const rates = played.length > 0 ? meanRates(played.map((s) => s.categoryRates!)) : null
  const { strong, weak } = rates ? strongAndWeak(rates) : { strong: [], weak: [] }
  const below50 = Object.fromEntries(
    CATEGORIES.map((c) => [c, played.filter((s) => s.categoryRates![c] < 50).map((s) => s.id)]),
  ) as Record<Category, number[]>

  return {
    studentCount: students.length,
    playedCount: played.length,
    recordCount,
    unmatchedRecordCount: input.scores.filter((r) => !rosterNicknames.has(r.nickname)).length,
    abandonedRecent: input.abandonedNicknames.filter((n) => rosterNicknames.has(n)).length,
    average,
    stdDev: sd,
    median: played.length > 0 ? median(averages) : null,
    highestAverage: played.length > 0 ? Math.max(...averages) : null,
    lowestAverage: played.length > 0 ? Math.min(...averages) : null,
    bestRecord: topScore === null ? null : { score: topScore, studentIds: played.filter((s) => s.best === topScore).map((s) => s.id) },
    scoreBands,
    fastCount,
    fastWarning: recordCount > 0 && fastCount * 2 >= recordCount,
    gradesAssigned: played.length >= MIN_STUDENTS_FOR_GRADES,
    gradeCounts,
    flagsShown: played.length >= MIN_STUDENTS_FOR_FLAGS,
    categoryRates: rates,
    strongCategories: strong,
    weakCategories: weak,
    below50,
  }
}

/** Class average per local date: the mean of each student's average that day. Most recent 14 dates. */
function dailyAverages(students: ReportStudent[]): ReportDay[] {
  const days = new Map<string, Map<number, number[]>>()
  for (const s of students) {
    for (const r of s.records) {
      const date = localDate(r.playedAt)
      const day = days.get(date) ?? new Map<number, number[]>()
      day.set(s.id, [...(day.get(s.id) ?? []), r.score])
      days.set(date, day)
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-DAILY_DAYS)
    .map(([date, day]) => ({
      date,
      average: mean([...day.values()].map(mean)),
      studentCount: day.size,
    }))
}

/** Per-question analysis over each student's latest game in the period that has answers. */
function weakness(input: ReportInput, studentOf: Map<string, InputStudent>): ReportWeakness {
  const latest = new Map<number, InputGame>()
  for (const game of [...input.answeredGames].sort(byPlayedAt)) {
    const student = studentOf.get(game.nickname)
    if (student) latest.set(student.id, game)
  }
  const studentIds = [...latest.keys()].sort((a, b) => a - b)
  const answered = new Set(input.answeredGames.map((g) => g.scoreId))

  const tally = new Map<string, { solved: number[]; wrong: number[] }>()
  const wrongByStudent: Record<number, string[]> = {}
  for (const id of studentIds) {
    wrongByStudent[id] = []
    for (const answer of latest.get(id)!.answers) {
      // Answers to questions no longer in either file cannot be shown, so they are left out.
      if (!input.questions.has(answer.questionId)) continue
      const entry = tally.get(answer.questionId) ?? { solved: [], wrong: [] }
      entry.solved.push(id)
      if (!answer.correct) {
        entry.wrong.push(id)
        wrongByStudent[id].push(answer.questionId)
      }
      tally.set(answer.questionId, entry)
    }
  }

  const detail = (questionId: string): ReportQuestionDetail => {
    const q = input.questions.get(questionId)!
    return { category: q.category, difficulty: q.difficulty, question: q.question, answer: q.choices[q.answerIndex] }
  }
  const ranked: ReportWrongQuestion[] = [...tally.entries()]
    .filter(([, t]) => t.solved.length >= MIN_SOLVERS && t.wrong.length > 0)
    .map(([questionId, t]) => {
      const wrongRate = (t.wrong.length / t.solved.length) * 100
      const q = detail(questionId)
      return {
        questionId,
        ...q,
        solvedBy: t.solved.length,
        wrongBy: t.wrong.length,
        wrongRate,
        wrongStudentIds: t.wrong,
        reteach: q.difficulty === 'easy' && wrongRate > 50,
      }
    })
    .sort(
      (a, b) =>
        b.wrongRate - a.wrongRate ||
        b.wrongBy - a.wrongBy ||
        a.questionId.localeCompare(b.questionId, undefined, { numeric: true }),
    )
  const questions = ranked.slice(0, WEAK_QUESTION_LIMIT)
  const cutoff = questions.at(-1)?.wrongRate
  return {
    recordsWithoutAnswers: input.scores.filter((r) => studentOf.has(r.nickname) && !answered.has(r.id)).length,
    studentIds,
    fastStudentIds: studentIds.filter((id) => latest.get(id)!.durationSec < FAST_RECORD_SEC),
    questions,
    tiedQuestionIds:
      cutoff === undefined
        ? []
        : ranked.slice(WEAK_QUESTION_LIMIT).filter((q) => Math.abs(q.wrongRate - cutoff) < EPSILON).map((q) => q.questionId),
    wrongByStudent,
    questionDetails: Object.fromEntries(
      [...new Set([...questions.map((q) => q.questionId), ...Object.values(wrongByStudent).flat()])].map((id) => [id, detail(id)]),
    ),
  }
}

/** Which students to compare, and why. Throws ReportError for a request that cannot be compared. */
function compareTargets(students: ReportStudent[], request: CompareRequest | undefined) {
  const played = students.filter((s) => s.playCount > 0)
  if (request === 'all') {
    if (played.length < 2) throw new ReportError('INVALID_REQUEST', '응시한 학생이 2명 미만이라 비교할 수 없습니다.')
    if (played.length > MAX_COMPARE) {
      throw new ReportError('INVALID_REQUEST', `응시한 학생이 ${played.length}명이라 한 번에 비교할 수 있는 ${MAX_COMPARE}명을 넘습니다. 학생을 골라 주세요.`)
    }
    return { targets: played, reason: 'requested' as const }
  }
  if (request) {
    const numbers = [...new Set(request)]
    const missing = numbers.filter((n) => !students.some((s) => s.number === n))
    if (missing.length > 0) throw new ReportError('STUDENT_NOT_FOUND', `명단에 없는 번호입니다: ${missing.join(', ')}`)
    if (numbers.length < 2) throw new ReportError('INVALID_REQUEST', '비교하려면 학생을 2명 이상 골라 주세요.')
    if (numbers.length > MAX_COMPARE) throw new ReportError('INVALID_REQUEST', `한 번에 ${MAX_COMPARE}명까지 비교할 수 있습니다.`)
    return { targets: students.filter((s) => numbers.includes(s.number)), reason: 'requested' as const }
  }
  const flagged = played.filter((s) => s.flag !== null)
  if (flagged.length >= 2) return { targets: flagged, reason: 'flagged' as const }
  const byAverage = [...played].sort((a, b) => b.average! - a.average! || a.number - b.number)
  const chosen = new Set([...byAverage.slice(0, 2), ...byAverage.slice(-2)])
  return { targets: students.filter((s) => chosen.has(s)), reason: 'topBottom' as const }
}

function compare(targets: ReportStudent[], reason: ReportCompare['reason']): ReportCompare {
  const played = targets.filter((s) => s.playCount > 0)
  const bestOf = (value: (s: ReportStudent) => number | null, lowerIsBetter = false): number[] => {
    const values = played.map(value).filter((v): v is number => v !== null)
    if (values.length === 0) return []
    const target = lowerIsBetter ? Math.min(...values) : Math.max(...values)
    return played.filter((s) => {
      const v = value(s)
      return v !== null && Math.abs(v - target) < EPSILON
    }).map((s) => s.id)
  }
  const best: ReportCompare['best'] = {
    playCount: bestOf((s) => s.playCount),
    best: bestOf((s) => s.best),
    average: bestOf((s) => s.average),
    recent: bestOf((s) => s.recent),
    averageDurationSec: bestOf((s) => s.averageDurationSec, true),
    fastCount: bestOf((s) => s.fastCount, true),
    rank: bestOf((s) => s.rank, true),
  }
  for (const c of CATEGORIES) best[c as CompareItem] = bestOf((s) => s.categoryRates![c])

  const gaps: ReportCompare['gaps'] = []
  if (played.length >= 2) {
    for (const c of CATEGORIES) {
      const rates = played.map((s) => s.categoryRates![c])
      const difference = Math.max(...rates) - Math.min(...rates)
      if (difference >= COMPARE_GAP - EPSILON) {
        gaps.push({ category: c, difference, highIds: bestOf((s) => s.categoryRates![c]), lowIds: bestOf((s) => s.categoryRates![c], true) })
      }
    }
  }

  const closeScores: ReportCompare['closeScores'] = []
  const teachingPairs: ReportCompare['teachingPairs'] = []
  const even = (s: ReportStudent) => s.strongCategories.length === CATEGORIES.length
  for (const a of played) {
    for (const b of played) {
      if (a === b) continue
      if (a.number < b.number && Math.abs(a.average! - b.average!) <= CLOSE_SCORE + EPSILON) {
        closeScores.push({
          studentIds: [a.id, b.id],
          scoreDifference: a.average! - b.average!,
          durationDifference: a.averageDurationSec! - b.averageDurationSec!,
        })
      }
      if (even(a) || even(b)) continue
      for (const c of a.strongCategories) {
        if (b.weakCategories.includes(c)) teachingPairs.push({ tutorId: a.id, learnerId: b.id, category: c })
      }
    }
  }
  return { studentIds: targets.map((s) => s.id), reason, best, gaps, closeScores, teachingPairs }
}

/** Builds the whole teacher report. Throws ReportError when `compareRequest` cannot be compared. */
export function buildReport(input: ReportInput, compareRequest?: CompareRequest): TeacherReport {
  const studentOf = new Map<string, InputStudent>()
  for (const s of input.students) for (const n of s.nicknames) studentOf.set(n, s)
  const rosterNicknames = new Set(studentOf.keys())

  const scores = [...input.scores].sort(byPlayedAt)
  const students = [...input.students]
    .sort((a, b) => a.number - b.number)
    .map((s) => studentValues(s, scores.filter((r) => studentOf.get(r.nickname)?.id === s.id)))
  const summary = summarize(input, students, rosterNicknames)

  const playedCount = summary.playedCount
  let compareResult: ReportCompare | null = null
  let compareSkipped: string | null = null
  if (compareRequest === undefined && playedCount < 2) {
    compareSkipped = '응시한 학생이 2명 미만이라 비교하지 않습니다.'
  } else {
    const { targets, reason } = compareTargets(students, compareRequest)
    compareResult = compare(targets, reason)
  }

  return {
    className: input.className,
    period: input.period,
    generatedAt: new Date(input.now).toISOString(),
    summary,
    students,
    daily: dailyAverages(students),
    weakness: weakness(input, studentOf),
    compare: compareResult,
    compareSkipped,
  }
}
