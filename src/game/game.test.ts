import { describe, expect, it } from 'vitest'
import rawQuestions from '../data/questions.json'
import { loadQuestions } from '../data/validateQuestions'
import { CATEGORIES, type GameState, type Question } from '../types/quiz'
import {
  answerQuestion,
  createGame,
  endIntro,
  getResult,
  getWrongAnswers,
  isCategoryStart,
  nextQuestion,
  shuffleChoices,
} from './game'
import { gameReducer, initialAppState } from './reducer'
import { seededRandom, shuffle } from './shuffle'

const questions = loadQuestions(rawQuestions)
const byId = new Map(questions.map((q) => [q.id, q]))
const originalAnswer = (q: Question) => {
  const original = byId.get(q.id)!
  return original.choices[original.answerIndex]
}

/**
 * Plays every question, answering correctly when `pickCorrect(i)` is true. Each category intro lasts
 * `introMs` and each question takes `msPerQuestion` from being shown to being answered.
 */
function play(state: GameState, pickCorrect: (index: number) => boolean, msPerQuestion = 1000, introMs = 0): GameState {
  let s = state
  let clock = s.startedAt
  for (let i = 0; i < s.questions.length; i++) {
    if (s.showingIntro) s = endIntro(s, (clock += introMs))
    const q = s.questions[s.currentIndex]
    const choice = pickCorrect(i) ? q.answerIndex : (q.answerIndex + 1) % 4
    s = answerQuestion(s, choice, (clock += msPerQuestion))
    s = nextQuestion(s, clock)
  }
  return s
}

/** Answers the current question (after its intro, if any) and moves on. */
function step(s: GameState, choiceIndex = 0, at = 0): GameState {
  if (s.showingIntro) s = endIntro(s, at)
  return nextQuestion(answerQuestion(s, choiceIndex, at), at)
}

describe('shuffle', () => {
  it('keeps every item and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffle(input, seededRandom(1))
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...result].sort()).toEqual(input)
  })

  it('is deterministic for the same random function', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seededRandom(7))).toEqual(shuffle([1, 2, 3, 4, 5, 6], seededRandom(7)))
  })
})

describe('createGame', () => {
  it('orders categories history → science → geography → arts, 10 each', () => {
    const game = createGame(questions, '테스터', { random: seededRandom(42) })
    expect(game.questions).toHaveLength(40)
    const expected = CATEGORIES.flatMap((c) => Array(10).fill(c))
    expect(game.questions.map((q) => q.category)).toEqual(expected)
  })

  it('shuffles question order within a category depending on the random function', () => {
    const a = createGame(questions, 'a', { random: seededRandom(1) }).questions.map((q) => q.id)
    const b = createGame(questions, 'b', { random: seededRandom(2) }).questions.map((q) => q.id)
    expect(a).not.toEqual(b)
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('gives the same order for the same seed', () => {
    const a = createGame(questions, 'a', { random: seededRandom(5) })
    const b = createGame(questions, 'a', { random: seededRandom(5) })
    expect(a.questions).toEqual(b.questions)
  })

  it('keeps answerIndex pointing at the original correct choice after shuffling choices', () => {
    for (let seed = 0; seed < 20; seed++) {
      const game = createGame(questions, 'a', { random: seededRandom(seed) })
      for (const q of game.questions) {
        expect(q.choices[q.answerIndex]).toBe(originalAnswer(q))
        expect([...q.choices].sort()).toEqual([...byId.get(q.id)!.choices].sort())
      }
    }
  })

  it('actually moves choices around for some questions', () => {
    const game = createGame(questions, 'a', { random: seededRandom(3) })
    const moved = game.questions.filter((q) => q.answerIndex !== byId.get(q.id)!.answerIndex)
    expect(moved.length).toBeGreaterThan(0)
  })

  it('does not mutate the source questions', () => {
    const before = JSON.stringify(questions)
    createGame(questions, 'a', { random: seededRandom(9) })
    expect(JSON.stringify(questions)).toBe(before)
  })

  it('starts in the playing phase at question 0 with score 0', () => {
    const game = createGame(questions, '닉네임', { now: 1000 })
    expect(game).toMatchObject({ phase: 'playing', nickname: '닉네임', currentIndex: 0, score: 0, startedAt: 1000 })
  })
})

describe('shuffleChoices', () => {
  it('updates answerIndex to follow the correct choice', () => {
    const q: Question = { ...questions[0], choices: ['A', 'B', 'C', 'D'], answerIndex: 2 }
    for (let seed = 0; seed < 10; seed++) {
      const shuffled = shuffleChoices(q, seededRandom(seed))
      expect(shuffled.choices[shuffled.answerIndex]).toBe('C')
    }
  })
})

describe('answerQuestion', () => {
  const fresh = () => endIntro(createGame(questions, 'a', { random: seededRandom(11), now: 0 }), 0)

  it('judges the shuffled correct choice as correct and adds 10 points', () => {
    const game = fresh()
    const q = game.questions[0]
    const after = answerQuestion(game, q.answerIndex, 500)
    expect(after.answers).toEqual([{ questionId: q.id, choiceIndex: q.answerIndex, correct: true }])
    expect(after.score).toBe(10)
  })

  it('judges any other choice as wrong with no penalty', () => {
    const game = fresh()
    const q = game.questions[0]
    const wrong = (q.answerIndex + 1) % 4
    const after = answerQuestion(game, wrong, 500)
    expect(after.answers[0].correct).toBe(false)
    expect(after.score).toBe(0)
  })

  it('does not allow changing an answer once chosen', () => {
    const game = fresh()
    const q = game.questions[0]
    const wrong = (q.answerIndex + 1) % 4
    const answered = answerQuestion(game, wrong, 500)
    const retried = answerQuestion(answered, q.answerIndex, 600)
    expect(retried).toBe(answered)
    expect(retried.answers).toHaveLength(1)
    expect(retried.answers[0].choiceIndex).toBe(wrong)
    expect(retried.score).toBe(0)
  })

  it('ignores out-of-range choices', () => {
    const game = fresh()
    expect(answerQuestion(game, 4)).toBe(game)
    expect(answerQuestion(game, -1)).toBe(game)
    expect(answerQuestion(game, 1.5)).toBe(game)
  })
})

describe('nextQuestion', () => {
  it('does not advance before the current question is answered', () => {
    const game = endIntro(createGame(questions, 'a', { random: seededRandom(1) }))
    expect(nextQuestion(game)).toBe(game)
  })

  it('advances one question at a time', () => {
    const game = endIntro(createGame(questions, 'a', { random: seededRandom(1) }))
    const next = nextQuestion(answerQuestion(game, 0))
    expect(next.currentIndex).toBe(1)
    expect(next.phase).toBe('playing')
  })

  it('moves to the result phase after the 40th question', () => {
    let s = createGame(questions, 'a', { random: seededRandom(1), now: 0 })
    for (let i = 0; i < 39; i++) s = step(s, 0, i)
    expect(s.currentIndex).toBe(39)
    expect(s.phase).toBe('playing')
    if (s.showingIntro) s = endIntro(s, 39)
    s = answerQuestion(s, 0, 39)
    expect(s.phase).toBe('playing')
    s = nextQuestion(s)
    expect(s.phase).toBe('result')
    expect(s.currentIndex).toBe(39)
    expect(nextQuestion(s)).toBe(s)
  })
})

describe('getResult', () => {
  it('gives 400 points for a perfect game', () => {
    const s = play(createGame(questions, '만점', { random: seededRandom(4), now: 0 }), () => true)
    const result = getResult(s)
    expect(result.score).toBe(400)
    expect(result.correctCount).toBe(40)
    expect(result.correctByCategory).toEqual({ history: 10, science: 10, geography: 10, arts: 10 })
  })

  it('gives 0 points when every answer is wrong', () => {
    const s = play(createGame(questions, 'a', { random: seededRandom(4), now: 0 }), () => false)
    expect(getResult(s)).toMatchObject({ score: 0, correctCount: 0 })
  })

  it('counts correct answers per category', () => {
    // Correct on the first 7 history, 3 science, 10 geography, 0 arts.
    const pattern = (i: number) => (i < 10 ? i < 7 : i < 20 ? i < 13 : i < 30)
    const s = play(createGame(questions, 'a', { random: seededRandom(8), now: 0 }), pattern)
    const result = getResult(s)
    expect(result.correctByCategory).toEqual({ history: 7, science: 3, geography: 10, arts: 0 })
    expect(result.totalByCategory).toEqual({ history: 10, science: 10, geography: 10, arts: 10 })
    expect(result.correctCount).toBe(20)
    expect(result.score).toBe(200)
  })

  it('measures time from the first question to the last answer, in seconds', () => {
    // Last answer is at 40 × 1.5s = 60s after start.
    const s = play(createGame(questions, 'a', { random: seededRandom(2), now: 10_000 }), () => true, 1500)
    expect(getResult(s).durationSec).toBe(60)
  })

  it('carries the nickname', () => {
    const s = play(createGame(questions, '홍길동', { now: 0 }), () => true)
    expect(getResult(s).nickname).toBe('홍길동')
  })
})

describe('gameReducer', () => {
  it('runs a full game from start to result and back to start', () => {
    const game = createGame(questions, '닉', { random: seededRandom(1), now: 0 })
    let s = gameReducer(initialAppState, { type: 'start', game })
    expect(s.phase).toBe('playing')
    for (let i = 0; i < 40; i++) {
      if (s.phase === 'playing' && s.showingIntro) s = gameReducer(s, { type: 'endIntro', at: i * 1000 })
      s = gameReducer(s, { type: 'answer', choiceIndex: 0, at: i * 1000 })
      s = gameReducer(s, { type: 'next', at: i * 1000 })
    }
    expect(s.phase).toBe('result')
    s = gameReducer(s, { type: 'restart' })
    expect(s).toEqual({ phase: 'start', nickname: '닉' })
  })

  it('ignores actions that do not fit the current phase', () => {
    expect(gameReducer(initialAppState, { type: 'answer', choiceIndex: 0, at: 0 })).toBe(initialAppState)
    expect(gameReducer(initialAppState, { type: 'next', at: 0 })).toBe(initialAppState)
    expect(gameReducer(initialAppState, { type: 'quit' })).toBe(initialAppState)
    expect(gameReducer(initialAppState, { type: 'endIntro', at: 0 })).toBe(initialAppState)
    expect(gameReducer(initialAppState, { type: 'restart' })).toBe(initialAppState)
  })
})

describe('category intro', () => {
  it('marks question 1, 11, 21 and 31 as category starts', () => {
    const game = createGame(questions, 'a', { random: seededRandom(6) })
    const starts = game.questions.map((_, i) => i).filter((i) => isCategoryStart(game.questions, i))
    expect(starts).toEqual([0, 10, 20, 30])
  })

  it('shows an intro before the first question and blocks answering until it ends', () => {
    const game = createGame(questions, 'a', { random: seededRandom(6), now: 0 })
    expect(game.showingIntro).toBe(true)
    expect(answerQuestion(game, 0, 100)).toBe(game)
    const shown = endIntro(game, 1000)
    expect(shown.showingIntro).toBe(false)
    expect(answerQuestion(shown, 0, 1500).answers).toHaveLength(1)
  })

  it('shows an intro only when the next question opens a new category', () => {
    let s = createGame(questions, 'a', { random: seededRandom(6), now: 0 })
    const introAt: number[] = []
    for (let i = 0; i < 40; i++) {
      if (s.showingIntro) {
        introAt.push(s.currentIndex)
        s = endIntro(s, i)
      }
      s = nextQuestion(answerQuestion(s, 0, i), i)
    }
    expect(introAt).toEqual([0, 10, 20, 30])
  })

  it('excludes intro time from the duration', () => {
    // 4 intros × 1s are excluded; 40 questions × 2s = 80s remain.
    const s = play(createGame(questions, 'a', { random: seededRandom(2), now: 5_000 }), () => true, 2000, 1000)
    expect(getResult(s).durationSec).toBe(80)
  })

  it('ignores endIntro when no intro is showing', () => {
    const shown = endIntro(createGame(questions, 'a', { now: 0 }), 1000)
    expect(endIntro(shown, 5000)).toBe(shown)
  })
})

describe('getWrongAnswers', () => {
  it('lists only the wrong answers, in order, with my answer, the correct answer and the explanation', () => {
    const wrongAt = new Set([2, 15, 39])
    const s = play(createGame(questions, 'a', { random: seededRandom(12), now: 0 }), (i) => !wrongAt.has(i))
    const wrong = getWrongAnswers(s)
    expect(wrong.map((w) => w.questionId)).toEqual([2, 15, 39].map((i) => s.questions[i].id))
    for (const [n, i] of [2, 15, 39].entries()) {
      const q = s.questions[i]
      expect(wrong[n]).toEqual({
        questionId: q.id,
        category: q.category,
        question: q.question,
        chosen: q.choices[s.answers[i].choiceIndex],
        correctChoice: originalAnswer(q),
        explanation: q.explanation,
      })
      expect(wrong[n].chosen).not.toBe(wrong[n].correctChoice)
    }
  })

  it('is empty for a perfect game', () => {
    const s = play(createGame(questions, 'a', { random: seededRandom(12), now: 0 }), () => true)
    expect(getWrongAnswers(s)).toEqual([])
  })

  it('matches the per-question records in the result', () => {
    const s = play(createGame(questions, 'a', { random: seededRandom(3), now: 0 }), (i) => i % 3 === 0)
    const { records } = getResult(s)
    expect(records).toHaveLength(40)
    expect(records.map((r) => r.questionId)).toEqual(s.questions.map((q) => q.id))
    expect(records.filter((r) => !r.correct)).toHaveLength(getWrongAnswers(s).length)
  })
})

describe('quitting', () => {
  it('discards the game and returns to the start screen with the nickname', () => {
    const game = endIntro(createGame(questions, '그만', { now: 0 }), 0)
    let s = gameReducer(initialAppState, { type: 'start', game })
    s = gameReducer(s, { type: 'answer', choiceIndex: 0, at: 10 })
    s = gameReducer(s, { type: 'quit' })
    expect(s).toEqual({ phase: 'start', nickname: '그만' })
  })
})
