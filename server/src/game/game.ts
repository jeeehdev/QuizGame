import {
  CATEGORIES,
  CATEGORY_INTRO_MS,
  POINTS_PER_CORRECT,
  type Category,
  type GameResult,
  type PublicQuestion,
} from '../../../shared/types.ts'
import { shuffle, type RandomFn } from './shuffle.ts'
import type { GameState, PlannedQuestion, Question } from './types.ts'

export interface CreateGameOptions {
  random?: RandomFn
  /** Time the game is created (ms); the duration is measured from here. */
  now?: number
}

/** Shows `question` with its choices in `choiceOrder`, moving answerIndex along with the correct choice. */
export function applyChoiceOrder(question: Question, choiceOrder: readonly number[]): Question {
  return {
    ...question,
    choices: choiceOrder.map((i) => question.choices[i]),
    answerIndex: choiceOrder.indexOf(question.answerIndex),
  }
}

/** Shuffles the choices of one question and moves answerIndex along with the correct choice. */
export function shuffleChoices(question: Question, random: RandomFn = Math.random): Question {
  return applyChoiceOrder(
    question,
    shuffle(
      question.choices.map((_, i) => i),
      random,
    ),
  )
}

/** Orders questions history → science → geography → arts, shuffling questions and choices within each category. */
export function planGame(bank: readonly Question[], random: RandomFn = Math.random): PlannedQuestion[] {
  return CATEGORIES.flatMap((category) =>
    shuffle(
      bank.filter((q) => q.category === category),
      random,
    ).map((q) => ({
      questionId: q.id,
      choiceOrder: shuffle(
        q.choices.map((_, i) => i),
        random,
      ),
    })),
  )
}

/** Rebuilds the questions as presented, from a stored plan. */
export function buildQuestions(bank: ReadonlyMap<string, Question>, plan: readonly PlannedQuestion[]): Question[] {
  return plan.map(({ questionId, choiceOrder }) => {
    const question = bank.get(questionId)
    if (!question) throw new Error(`Unknown question in plan: ${questionId}`)
    return applyChoiceOrder(question, choiceOrder)
  })
}

export function createGame(
  bank: readonly Question[],
  nickname: string,
  { random = Math.random, now = Date.now() }: CreateGameOptions = {},
): GameState {
  const plan = planGame(bank, random)
  return {
    nickname,
    plan,
    questions: buildQuestions(new Map(bank.map((q) => [q.id, q])), plan),
    answers: [],
    startedAt: now,
  }
}

/** The question waiting for an answer, or null when every question has been answered. */
export function currentQuestion(state: GameState): Question | null {
  return state.questions[state.answers.length] ?? null
}

export function isComplete(state: GameState): boolean {
  return state.answers.length === state.questions.length
}

/** Records the answer to the current question. Answers can only be added in order and never changed. */
export function answerQuestion(state: GameState, choiceIndex: number, now: number = Date.now()): GameState {
  const question = currentQuestion(state)
  if (!question) return state
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) return state
  return {
    ...state,
    answers: [
      ...state.answers,
      { questionId: question.id, choiceIndex, correct: choiceIndex === question.answerIndex, answeredAt: now },
    ],
  }
}

export function getScore(state: Pick<GameState, 'answers'>): number {
  return state.answers.filter((a) => a.correct).length * POINTS_PER_CORRECT
}

/**
 * Duration from game creation to the last answer, minus one intro per category. The intros are shown
 * by the client only, so a fixed length is subtracted rather than trusting client timing.
 */
export function getDurationSec(state: GameState): number {
  const last = state.answers.at(-1)?.answeredAt ?? state.startedAt
  const intros = new Set(state.questions.map((q) => q.category)).size
  return Math.round(Math.max(0, last - state.startedAt - intros * CATEGORY_INTRO_MS) / 1000)
}

export function getResult(state: GameState): GameResult {
  const correctByCategory = emptyCategoryCounts()
  const totalByCategory = emptyCategoryCounts()
  state.questions.forEach((q, i) => {
    totalByCategory[q.category]++
    if (state.answers[i]?.correct) correctByCategory[q.category]++
  })
  return {
    nickname: state.nickname,
    score: getScore(state),
    correctCount: state.answers.filter((a) => a.correct).length,
    total: state.questions.length,
    correctByCategory,
    totalByCategory,
    durationSec: getDurationSec(state),
    records: state.answers.map(({ questionId, choiceIndex, correct }) => ({ questionId, choiceIndex, correct })),
  }
}

/** Strips the answer and explanation so the question can be sent before it is answered. */
export function toPublicQuestion({ id, category, question, choices }: Question): PublicQuestion {
  return { id, category, question, choices }
}

function emptyCategoryCounts(): Record<Category, number> {
  return { history: 0, science: 0, geography: 0, arts: 0 }
}
