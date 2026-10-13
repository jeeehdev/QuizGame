export * from '../../shared/types.ts'
import type { Category } from '../../shared/types.ts'

/** What the server revealed after the player answered one question. */
export interface Reveal {
  choiceIndex: number
  correct: boolean
  answerIndex: number
  explanation: string
}

export interface WrongAnswer {
  questionId: string
  category: Category
  question: string
  chosen: string
  correctChoice: string
  explanation: string
}
