export const CATEGORIES = ['history', 'science', 'geography', 'arts'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  history: '한국사',
  science: '과학',
  geography: '지리',
  arts: '예술과 문화',
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: string
  category: Category
  difficulty: Difficulty
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
}

export interface AnswerRecord {
  questionId: string
  choiceIndex: number
  correct: boolean
}

export interface GameState {
  phase: 'playing' | 'result'
  nickname: string
  questions: Question[]
  currentIndex: number
  /** answers[i] is the answer to questions[i]; length = number of answered questions */
  answers: AnswerRecord[]
  score: number
  startedAt: number
  finishedAt: number | null
  /** True while the 1-second category intro is shown; answering is blocked. */
  showingIntro: boolean
  introStartedAt: number | null
  /** Total time spent on category intros, excluded from the duration. */
  pausedMs: number
}

export type AppState = { phase: 'start'; nickname: string } | GameState

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

export interface WrongAnswer {
  questionId: string
  category: Category
  question: string
  chosen: string
  correctChoice: string
  explanation: string
}
