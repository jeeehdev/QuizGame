import { describe, expect, it } from 'vitest'
import type { AnswerResponse, CreateGameResponse, FinishResponse, PublicQuestion } from '../types/quiz'
import {
  canSendAnswer,
  gameReducer,
  getWrongAnswers,
  initialAppState,
  type AppState,
  type GameAction,
  type PlayingState,
} from './reducer'

const CATS = ['history', 'science', 'geography', 'arts'] as const
const questions: PublicQuestion[] = CATS.flatMap((category, c) =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${category}-${i}`,
    category,
    question: `Q${c * 10 + i + 1}`,
    choices: ['A', 'B', 'C', 'D'],
  })),
)
const created: CreateGameResponse = { gameId: 'g1', nickname: '닉', questions }
const verdict = (correct: boolean, score: number, answerIndex = 0): AnswerResponse => ({
  correct,
  answerIndex,
  explanation: '해설',
  score,
})

function run(state: AppState, ...actions: GameAction[]): AppState {
  return actions.reduce(gameReducer, state)
}

function started(): PlayingState {
  return run(
    initialAppState,
    { type: 'startRequested', nickname: '닉' },
    { type: 'gameCreated', game: created },
    { type: 'endIntro' },
  ) as PlayingState
}

/** Answers the current question (correctly when choice 0) and goes on; ends any intro first. */
function answerAndNext(s: PlayingState, choiceIndex = 0): PlayingState {
  const index = s.currentIndex
  const correct = choiceIndex === 0
  const score = s.score + (correct ? 10 : 0)
  return run(
    s,
    { type: 'answerRequested', gameId: 'g1', choiceIndex },
    { type: 'answerSucceeded', gameId: 'g1', index, response: verdict(correct, score) },
    { type: 'next' },
    { type: 'endIntro' },
  ) as PlayingState
}

describe('starting', () => {
  it('goes start → starting → playing with the first category intro', () => {
    let s = run(initialAppState, { type: 'startRequested', nickname: '닉' })
    expect(s).toMatchObject({ phase: 'start', starting: true, nickname: '닉' })
    s = run(s, { type: 'gameCreated', game: created })
    expect(s).toMatchObject({ phase: 'playing', gameId: 'g1', currentIndex: 0, showingIntro: true, score: 0 })
  })

  it('shows a start failure and allows another try', () => {
    const s = run(initialAppState, { type: 'startRequested', nickname: '닉' }, { type: 'startFailed', message: '오류' })
    expect(s).toMatchObject({ phase: 'start', starting: false, error: '오류' })
    expect(run(s, { type: 'startRequested', nickname: '닉' })).toMatchObject({ starting: true, error: null })
  })
})

describe('answering', () => {
  it('marks the choice as pending, then records the server verdict and score', () => {
    let s: AppState = run(started(), { type: 'answerRequested', gameId: 'g1', choiceIndex: 2 })
    expect(s).toMatchObject({ pendingChoice: 2, reveals: [] })
    s = run(s, { type: 'answerSucceeded', gameId: 'g1', index: 0, response: verdict(false, 0, 1) })
    expect(s).toMatchObject({
      pendingChoice: null,
      score: 0,
      reveals: [{ choiceIndex: 2, correct: false, answerIndex: 1, explanation: '해설' }],
    })
  })

  it('blocks other choices while a request is pending, and the answer cannot change once known', () => {
    const pending = run(started(), { type: 'answerRequested', gameId: 'g1', choiceIndex: 2 }) as PlayingState
    expect(canSendAnswer(pending, 1)).toBe(false)
    expect(canSendAnswer(pending, 2)).toBe(false)
    expect(run(pending, { type: 'answerRequested', gameId: 'g1', choiceIndex: 1 })).toBe(pending)

    const answered = run(pending, { type: 'answerSucceeded', gameId: 'g1', index: 0, response: verdict(true, 10) }) as PlayingState
    expect(canSendAnswer(answered, 0)).toBe(false)
    expect(run(answered, { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 })).toBe(answered)
  })

  it('after a failure keeps the choice and allows retrying only that choice', () => {
    const failed = run(
      started(),
      { type: 'answerRequested', gameId: 'g1', choiceIndex: 3 },
      { type: 'answerFailed', gameId: 'g1', message: '네트워크 오류' },
    ) as PlayingState
    expect(failed).toMatchObject({ pendingChoice: 3, error: '네트워크 오류' })
    expect(canSendAnswer(failed, 3)).toBe(true)
    expect(canSendAnswer(failed, 0)).toBe(false)
    expect(run(failed, { type: 'answerRequested', gameId: 'g1', choiceIndex: 3 })).toMatchObject({ pendingChoice: 3, error: null })
  })

  it('blocks answering during a category intro', () => {
    const intro = run(initialAppState, { type: 'startRequested', nickname: '닉' }, { type: 'gameCreated', game: created }) as PlayingState
    expect(canSendAnswer(intro, 0)).toBe(false)
  })

  it('ignores responses for another game or another question', () => {
    const pending = run(started(), { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 })
    expect(run(pending, { type: 'answerSucceeded', gameId: 'old', index: 0, response: verdict(true, 10) })).toBe(pending)
    expect(run(pending, { type: 'answerSucceeded', gameId: 'g1', index: 5, response: verdict(true, 10) })).toBe(pending)
    expect(run(pending, { type: 'answerFailed', gameId: 'old', message: 'x' })).toBe(pending)
  })
})

describe('moving on', () => {
  it('does not move on before the answer is known', () => {
    const pending = run(started(), { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 })
    expect(run(pending, { type: 'next' })).toBe(pending)
  })

  it('shows a category intro before questions 11, 21 and 31 only', () => {
    let s = started()
    const intros: number[] = []
    for (let i = 0; i < 39; i++) {
      s = run(
        s,
        { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 },
        { type: 'answerSucceeded', gameId: 'g1', index: i, response: verdict(true, (i + 1) * 10) },
        { type: 'next' },
      ) as PlayingState
      if (s.showingIntro) intros.push(s.currentIndex + 1)
      s = run(s, { type: 'endIntro' }) as PlayingState
    }
    expect(intros).toEqual([11, 21, 31])
    expect(s.currentIndex).toBe(39)
  })
})

describe('finishing', () => {
  function atLastAnswered(): PlayingState {
    let s = started()
    for (let i = 0; i < 39; i++) s = answerAndNext(s, i % 2)
    return run(
      s,
      { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 },
      { type: 'answerSucceeded', gameId: 'g1', index: 39, response: verdict(true, s.score + 10) },
    ) as PlayingState
  }
  const finish: FinishResponse = {
    scoreId: 7,
    rank: 3,
    result: {
      nickname: '닉',
      score: 210,
      correctCount: 21,
      total: 40,
      correctByCategory: { history: 5, science: 5, geography: 5, arts: 6 },
      totalByCategory: { history: 10, science: 10, geography: 10, arts: 10 },
      durationSec: 90,
      records: [],
    },
  }

  it('next does nothing on the last question; finish saves and shows the result', () => {
    const last = atLastAnswered()
    expect(run(last, { type: 'next' })).toBe(last)
    const saving = run(last, { type: 'finishRequested', gameId: 'g1' })
    expect(saving).toMatchObject({ finishing: true })
    expect(canSendAnswer(saving as PlayingState, 0)).toBe(false)
    const result = run(saving, { type: 'finishSucceeded', gameId: 'g1', finish })
    expect(result).toMatchObject({ phase: 'result', finish })
  })

  it('cannot finish before the last answer', () => {
    const s = started()
    expect(run(s, { type: 'finishRequested', gameId: 'g1' })).toBe(s)
  })

  it('shows a save failure and allows retrying', () => {
    const failed = run(atLastAnswered(), { type: 'finishRequested', gameId: 'g1' }, { type: 'finishFailed', gameId: 'g1', message: '오류' })
    expect(failed).toMatchObject({ finishing: false, error: '오류' })
    expect(run(failed, { type: 'finishRequested', gameId: 'g1' })).toMatchObject({ finishing: true, error: null })
  })

  it('restart returns to the start screen with the nickname', () => {
    const result = run(atLastAnswered(), { type: 'finishRequested', gameId: 'g1' }, { type: 'finishSucceeded', gameId: 'g1', finish })
    expect(run(result, { type: 'restart' })).toEqual({ phase: 'start', nickname: '닉', starting: false, error: null })
  })
})

describe('quitting and the leaderboard screen', () => {
  it('quit discards the game, and late responses for it are ignored', () => {
    const pending = run(started(), { type: 'answerRequested', gameId: 'g1', choiceIndex: 0 })
    const quit = run(pending, { type: 'quit' })
    expect(quit).toEqual({ phase: 'start', nickname: '닉', starting: false, error: null })
    expect(run(quit, { type: 'answerSucceeded', gameId: 'g1', index: 0, response: verdict(true, 10) })).toBe(quit)
  })

  it('opens and closes the leaderboard from the start screen only', () => {
    const board = run(initialAppState, { type: 'showLeaderboard' })
    expect(board).toEqual({ phase: 'leaderboard', nickname: '' })
    expect(run(board, { type: 'closeLeaderboard' })).toEqual(initialAppState)
    const s = started()
    expect(run(s, { type: 'showLeaderboard' })).toBe(s)
  })
})

describe('getWrongAnswers', () => {
  it('lists only wrong answers in order, with my answer, the correct answer and the explanation', () => {
    const reveals = [
      { choiceIndex: 0, correct: true, answerIndex: 0, explanation: 'e1' },
      { choiceIndex: 2, correct: false, answerIndex: 1, explanation: 'e2' },
      { choiceIndex: 3, correct: false, answerIndex: 0, explanation: 'e3' },
    ]
    expect(getWrongAnswers(questions, reveals)).toEqual([
      { questionId: 'history-1', category: 'history', question: 'Q2', chosen: 'C', correctChoice: 'B', explanation: 'e2' },
      { questionId: 'history-2', category: 'history', question: 'Q3', chosen: 'D', correctChoice: 'A', explanation: 'e3' },
    ])
  })

  it('is empty when everything is correct', () => {
    expect(getWrongAnswers(questions, [{ choiceIndex: 1, correct: true, answerIndex: 1, explanation: '' }])).toEqual([])
  })
})
