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

/** GET /api/teacher/session: the teacher is logged in until this time (ms since epoch), extended by each request. */
export interface TeacherSessionResponse {
  expiresAt: number
}

export interface ApiErrorBody {
  error: ApiErrorCode
  message: string
}
