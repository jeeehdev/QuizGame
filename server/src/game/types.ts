import type { QuizQuestion } from '../../../shared/types.ts'

export type { Difficulty } from '../../../shared/types.ts'

/** A question with its answer. Sent to clients only through the teacher API. */
export type Question = QuizQuestion

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
