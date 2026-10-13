import type { Category } from '../../../shared/types.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** A question with its answer. Server-only. */
export interface Question {
  id: string
  category: Category
  difficulty: Difficulty
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
}

/** How one question is presented in a game: which question, and the order of its original choices. */
export interface PlannedQuestion {
  questionId: string
  /** choiceOrder[i] is the original index of the choice shown at position i. */
  choiceOrder: number[]
}

export interface StoredAnswer {
  questionId: string
  /** Index in the shuffled choices the player saw. */
  choiceIndex: number
  correct: boolean
  answeredAt: number
}

export interface GameState {
  nickname: string
  plan: PlannedQuestion[]
  /** Questions in play order with shuffled choices and answerIndex updated to match. */
  questions: Question[]
  answers: StoredAnswer[]
  startedAt: number
}
