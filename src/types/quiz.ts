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
}
