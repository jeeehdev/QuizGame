import { CATEGORIES, type Category, type GameResult, type GameState, type Question } from '../types/quiz'
import { shuffle, type RandomFn } from './shuffle'

export const POINTS_PER_CORRECT = 10

export interface CreateGameOptions {
  random?: RandomFn
  /** Time the first question is shown (ms). */
  now?: number
}

/** Shuffles the choices of one question and moves answerIndex along with the correct choice. */
export function shuffleChoices(question: Question, random: RandomFn = Math.random): Question {
  const order = shuffle(
    question.choices.map((_, i) => i),
    random,
  )
  return {
    ...question,
    choices: order.map((i) => question.choices[i]),
    answerIndex: order.indexOf(question.answerIndex),
  }
}

/** Orders questions history → science → geography → arts, shuffling questions and choices within each category. */
export function createGame(
  questions: readonly Question[],
  nickname: string,
  { random = Math.random, now = Date.now() }: CreateGameOptions = {},
): GameState {
  const ordered = CATEGORIES.flatMap((category) =>
    shuffle(
      questions.filter((q) => q.category === category),
      random,
    ).map((q) => shuffleChoices(q, random)),
  )
  return {
    phase: 'playing',
    nickname,
    questions: ordered,
    currentIndex: 0,
    answers: [],
    score: 0,
    startedAt: now,
    finishedAt: null,
  }
}

export function isCurrentAnswered(state: GameState): boolean {
  return state.answers.length > state.currentIndex
}

/** Records the answer to the current question. Once answered, further calls return the state unchanged. */
export function answerQuestion(state: GameState, choiceIndex: number, now: number = Date.now()): GameState {
  if (state.phase !== 'playing' || isCurrentAnswered(state)) return state
  const question = state.questions[state.currentIndex]
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) return state

  const correct = choiceIndex === question.answerIndex
  const isLast = state.currentIndex === state.questions.length - 1
  return {
    ...state,
    answers: [...state.answers, { questionId: question.id, choiceIndex, correct }],
    score: state.score + (correct ? POINTS_PER_CORRECT : 0),
    finishedAt: isLast ? now : state.finishedAt,
  }
}

/** Moves to the next question, or to the result phase after the last one. Requires the current question to be answered. */
export function nextQuestion(state: GameState): GameState {
  if (state.phase !== 'playing' || !isCurrentAnswered(state)) return state
  if (state.currentIndex >= state.questions.length - 1) return { ...state, phase: 'result' }
  return { ...state, currentIndex: state.currentIndex + 1 }
}

export function getResult(state: GameState): GameResult {
  const correctByCategory = emptyCategoryCounts()
  const totalByCategory = emptyCategoryCounts()
  state.questions.forEach((q, i) => {
    totalByCategory[q.category]++
    if (state.answers[i]?.correct) correctByCategory[q.category]++
  })
  const correctCount = state.answers.filter((a) => a.correct).length
  const end = state.finishedAt ?? state.startedAt
  return {
    nickname: state.nickname,
    score: correctCount * POINTS_PER_CORRECT,
    correctCount,
    total: state.questions.length,
    correctByCategory,
    totalByCategory,
    durationSec: Math.round((end - state.startedAt) / 1000),
  }
}

function emptyCategoryCounts(): Record<Category, number> {
  return { history: 0, science: 0, geography: 0, arts: 0 }
}
