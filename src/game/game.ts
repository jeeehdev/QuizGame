import {
  CATEGORIES,
  type Category,
  type GameResult,
  type GameState,
  type Question,
  type WrongAnswer,
} from '../types/quiz'
import { shuffle, type RandomFn } from './shuffle'

export const POINTS_PER_CORRECT = 10
export const CATEGORY_INTRO_MS = 1000

export interface CreateGameOptions {
  random?: RandomFn
  /** Time the game starts (ms); the first category intro is shown from here. */
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

/** True when the question at `index` is the first of its category, so a category intro is shown before it. */
export function isCategoryStart(questions: readonly Question[], index: number): boolean {
  if (index < 0 || index >= questions.length) return false
  return index === 0 || questions[index].category !== questions[index - 1].category
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
    showingIntro: true,
    introStartedAt: now,
    pausedMs: 0,
  }
}

/** Hides the category intro and shows the question; the intro time is excluded from the duration. */
export function endIntro(state: GameState, now: number = Date.now()): GameState {
  if (!state.showingIntro) return state
  return {
    ...state,
    showingIntro: false,
    introStartedAt: null,
    pausedMs: state.pausedMs + Math.max(0, now - (state.introStartedAt ?? now)),
  }
}

export function isCurrentAnswered(state: GameState): boolean {
  return state.answers.length > state.currentIndex
}

/** Records the answer to the current question. Once answered, further calls return the state unchanged. */
export function answerQuestion(state: GameState, choiceIndex: number, now: number = Date.now()): GameState {
  if (state.phase !== 'playing' || state.showingIntro || isCurrentAnswered(state)) return state
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

/**
 * Moves to the next question, or to the result phase after the last one. Requires the current
 * question to be answered. Starts a category intro when the next question opens a new category.
 */
export function nextQuestion(state: GameState, now: number = Date.now()): GameState {
  if (state.phase !== 'playing' || !isCurrentAnswered(state)) return state
  if (state.currentIndex >= state.questions.length - 1) return { ...state, phase: 'result' }
  const nextIndex = state.currentIndex + 1
  const intro = isCategoryStart(state.questions, nextIndex)
  return {
    ...state,
    currentIndex: nextIndex,
    showingIntro: intro,
    introStartedAt: intro ? now : null,
  }
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
    durationSec: Math.round(Math.max(0, end - state.startedAt - state.pausedMs) / 1000),
    records: [...state.answers],
  }
}

/** Questions answered wrong, in the order asked, with the chosen and correct choice text. */
export function getWrongAnswers(state: GameState): WrongAnswer[] {
  return state.answers.flatMap((answer, i) => {
    if (answer.correct) return []
    const q = state.questions[i]
    return [
      {
        questionId: q.id,
        category: q.category,
        question: q.question,
        chosen: q.choices[answer.choiceIndex],
        correctChoice: q.choices[q.answerIndex],
        explanation: q.explanation,
      },
    ]
  })
}

function emptyCategoryCounts(): Record<Category, number> {
  return { history: 0, science: 0, geography: 0, arts: 0 }
}
