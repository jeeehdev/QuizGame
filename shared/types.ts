// Types and constants shared by the client and the server. No question data lives here;
// types that carry answers (QuizQuestion) are only sent to a logged-in teacher.

export const CATEGORIES = ['history', 'science', 'geography', 'arts'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  history: '한국사',
  science: '과학',
  geography: '지리',
  arts: '예술과 문화',
}

export const POINTS_PER_CORRECT = 10
/** Each category starts with an intro of this length; the server subtracts it from the duration. */
export const CATEGORY_INTRO_MS = 1000

/** A question as sent to the client before it is answered: no answer, no explanation. */
export interface PublicQuestion {
  id: string
  category: Category
  question: string
  choices: string[]
}

/** True when the question at `index` is the first of its category, so a category intro is shown before it. */
export function isCategoryStart(questions: readonly { category: Category }[], index: number): boolean {
  if (index < 0 || index >= questions.length) return false
  return index === 0 || questions[index].category !== questions[index - 1].category
}

// ---- API ----

export interface CreateGameRequest {
  nickname: string
}

export interface CreateGameResponse {
  gameId: string
  nickname: string
  questions: PublicQuestion[]
}

export interface AnswerRequest {
  questionId: string
  choiceIndex: number
}

export interface AnswerResponse {
  correct: boolean
  answerIndex: number
  explanation: string
  /** Total score so far. */
  score: number
}

export interface AnswerRecord {
  questionId: string
  choiceIndex: number
  correct: boolean
}

export interface GameResult {
  nickname: string
  score: number
  correctCount: number
  total: number
  correctByCategory: Record<Category, number>
  totalByCategory: Record<Category, number>
  durationSec: number
  /** One record per question, in the order asked. */
  records: AnswerRecord[]
}

export interface FinishResponse {
  scoreId: number
  /** 1-based; ties on score and time share a rank. */
  rank: number
  result: GameResult
}

export interface LeaderboardEntry {
  id: number
  rank: number
  nickname: string
  score: number
  durationSec: number
  playedAt: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
}

export type ApiErrorCode =
  | 'INVALID_NICKNAME'
  | 'INVALID_REQUEST'
  | 'GAME_NOT_FOUND'
  | 'OUT_OF_ORDER'
  | 'ALREADY_ANSWERED'
  | 'GAME_NOT_COMPLETE'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'UNAUTHORIZED'
  | 'WRONG_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
  | 'SWAP_REJECTED'
  | 'DUPLICATE_NUMBER'
  | 'NICKNAME_TAKEN'
  | 'STUDENT_NOT_FOUND'
  | 'NICKNAME_NOT_FOUND'
  | 'INVALID_PERIOD'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** A full question with its answer and explanation (server data files, teacher API). */
export interface QuizQuestion {
  id: string
  category: Category
  difficulty: Difficulty
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
}

/** GET /api/teacher/questions: questions in play and the candidate pool. */
export interface TeacherQuestionsResponse {
  bank: QuizQuestion[]
  candidates: QuizQuestion[]
}

/** POST /api/teacher/swap */
export interface SwapRequest {
  bankId: string
  candidateId: string
}

/** POST /api/teacher/swap: what moved, and both lists after the swap. */
export interface SwapResponse extends TeacherQuestionsResponse {
  /** The candidate that is now in play. */
  added: QuizQuestion
  /** The question that left play and is now a candidate. */
  removed: QuizQuestion
}

/** One student on the class roster. playCount counts finished games under any of the student's nicknames. */
export interface RosterStudent {
  id: number
  /** 출석 번호 */
  number: number
  name: string
  nicknames: string[]
  playCount: number
}

/** GET /api/teacher/roster */
export interface RosterResponse {
  className: string
  students: RosterStudent[]
}

/** POST /api/teacher/students */
export interface AddStudentRequest {
  number: number
  name: string
  nicknames?: string[]
}

/** PATCH /api/teacher/students/:id */
export interface UpdateStudentRequest {
  number?: number
  name?: string
}

/** A nickname with saved scores that is not linked to any student. */
export interface UnmatchedNickname {
  nickname: string
  playCount: number
  bestScore: number
  firstPlayedAt: string
  lastPlayedAt: string
  /** Students whose name or nicknames look like this nickname (e.g. 지훈2 → 박지훈). Never linked automatically. */
  similarStudentIds: number[]
}

/** GET /api/teacher/nicknames/unmatched */
export interface UnmatchedNicknamesResponse {
  nicknames: UnmatchedNickname[]
}

/** GET /api/teacher/session: the teacher is logged in until this time (ms since epoch), extended by each request. */
export interface TeacherSessionResponse {
  expiresAt: number
}

export interface ApiErrorBody {
  error: ApiErrorCode
  message: string
}

// ---- Teacher report (GET /api/teacher/report, npm run teacher-report). Rules: docs/teacher-mode.md ----

export type Grade = 'A' | 'B' | 'C' | 'D'
/** 📈 up, 📉 down, ➡️ flat */
export type Trend = 'up' | 'down' | 'flat'
/** ⚠️ one standard deviation or more below the class average, ⭐ one or more above */
export type StudentFlag = 'warning' | 'star'
/** Percentages (0~100, not rounded) per category. */
export type CategoryRates = Record<Category, number>

/** Records played at or after `from` and before `to` (UTC ISO). Both are null for `all`. */
export interface ReportPeriod {
  /** The period argument as given: all, today, 7d, 30d or YYYY-MM-DD~YYYY-MM-DD */
  key: string
  /** e.g. "최근 7일 (2026-10-09~2026-10-15)" */
  label: string
  from: string | null
  to: string | null
}

/** One finished game of a student, oldest first. */
export interface ReportRecord {
  scoreId: number
  nickname: string
  playedAt: string
  score: number
  /** Score minus the student's previous record in the period; null for the first. */
  change: number | null
  correctByCategory: Record<Category, number>
  durationSec: number
  /** ⏱️ under 80 seconds */
  fast: boolean
}

export interface ReportStudent {
  id: number
  number: number
  name: string
  nicknames: string[]
  /** Finished games in the period. 0 means 미응시, and every value below is null or empty. */
  playCount: number
  fastCount: number
  best: number | null
  average: number | null
  recent: number | null
  first: number | null
  /** average − class average */
  vsClass: number | null
  categoryRates: CategoryRates | null
  /** Highest and lowest categories (ties included). All four means 차이 없음. */
  strongCategories: Category[]
  weakCategories: Category[]
  averageDurationSec: number | null
  lastPlayedAt: string | null
  /** RANK() by average among students who played. */
  rank: number | null
  /** Null when the student did not play, or fewer than 5 students played. */
  grade: Grade | null
  /** Only when 3 or more students played. */
  flag: StudentFlag | null
  /** recent − first, from 2 records. */
  change: number | null
  trend: Trend | null
  /** Category rate change in %p: last 2 records vs first 2 (first and last record when there are 2~3). */
  categoryChange: CategoryRates | null
  records: ReportRecord[]
}

export interface ReportSummary {
  studentCount: number
  playedCount: number
  /** Finished games of roster students in the period. */
  recordCount: number
  /** Finished games in the period under nicknames not on the roster (left out of every statistic). */
  unmatchedRecordCount: number
  /** Games roster students started in the last 24 hours and left unfinished. */
  abandonedRecent: number
  /** Mean of the students' average scores. */
  average: number | null
  /** Population standard deviation of the same values; null when fewer than 3 students played. */
  stdDev: number | null
  median: number | null
  highestAverage: number | null
  lowestAverage: number | null
  /** Highest best score, and every student who reached it. */
  bestRecord: { score: number; studentIds: number[] } | null
  /** Students by best score: 0~99, 100~199, 200~299, 300~399, 400 */
  scoreBands: [number, number, number, number, number]
  fastCount: number
  /** Half or more of the records are fast: results may not reflect skill. */
  fastWarning: boolean
  /** False when fewer than 5 students played. */
  gradesAssigned: boolean
  gradeCounts: Record<Grade, number>
  /** False when fewer than 3 students played (no ⚠️⭐, no standard deviation). */
  flagsShown: boolean
  /** Mean of the students' category rates. */
  categoryRates: CategoryRates | null
  strongCategories: Category[]
  weakCategories: Category[]
  /** Students under 50% per category. */
  below50: Record<Category, number[]>
}

/** Class average on one local date. */
export interface ReportDay {
  /** YYYY-MM-DD, local time */
  date: string
  /** Mean of each student's average that day. */
  average: number
  studentCount: number
}

export interface ReportWrongQuestion {
  questionId: string
  category: Category
  difficulty: Difficulty
  question: string
  answer: string
  solvedBy: number
  wrongBy: number
  /** Percent; computed only when 3 or more students solved it. */
  wrongRate: number
  wrongStudentIds: number[]
  /** Easy and more than half got it wrong: 다시 가르칠 내용 후보 (or an ambiguous question, see /quiz-check). */
  reteach: boolean
}

/** Per-question analysis from the last 24 hours, whatever the period. One game per student: their latest. */
export interface ReportWeakness {
  since: string
  /** Students with a finished game in the last 24 hours. */
  studentIds: number[]
  /** Students whose latest game there is fast (⏱️ next to their name). */
  fastStudentIds: number[]
  /** Top 10 by wrong rate. */
  questions: ReportWrongQuestion[]
  /** Questions with the same wrong rate as the 10th that did not fit in the table. */
  tiedQuestionIds: string[]
  /** Questions each student got wrong in their latest game, by student id. */
  wrongByStudent: Record<number, string[]>
  /** Every question that appears in `questions` or `wrongByStudent`, by id. */
  questionDetails: Record<string, ReportQuestionDetail>
}

export interface ReportQuestionDetail {
  category: Category
  difficulty: Difficulty
  question: string
  answer: string
}

export type CompareItem =
  | 'playCount'
  | 'best'
  | 'average'
  | 'recent'
  | 'averageDurationSec'
  | 'fastCount'
  | 'rank'
  | Category

export interface ReportCompare {
  studentIds: number[]
  /** requested: the compare argument, flagged: ⚠️ and ⭐ students, topBottom: top 2 and bottom 2 by average */
  reason: 'requested' | 'flagged' | 'topBottom'
  /** Students with the best value per item (higher is better, except time, fast records and rank). */
  best: Partial<Record<CompareItem, number[]>>
  /** Categories where students differ by 20%p or more. */
  gaps: { category: Category; difference: number; highIds: number[]; lowIds: number[] }[]
  /** Pairs whose averages are within 10 points, with the time difference (a − b, seconds). */
  closeScores: { studentIds: [number, number]; scoreDifference: number; durationDifference: number }[]
  /** One student's strong category is another's weak category. */
  teachingPairs: { tutorId: number; learnerId: number; category: Category }[]
}

/** GET /api/teacher/report?period=…&compare=… */
export interface TeacherReport {
  className: string
  period: ReportPeriod
  /** ISO time the report was made. */
  generatedAt: string
  summary: ReportSummary
  /** Every roster student in 출석 번호 order, including 미응시. */
  students: ReportStudent[]
  /** Most recent 14 dates with records. */
  daily: ReportDay[]
  weakness: ReportWeakness
  /** Null when fewer than 2 students played; `compareSkipped` says why. */
  compare: ReportCompare | null
  compareSkipped: string | null
}
