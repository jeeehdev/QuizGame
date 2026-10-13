import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategoryStart } from '../../../shared/types.ts'
import {
  answerQuestion,
  buildQuestions,
  createGame,
  currentQuestion,
  getDurationSec,
  getResult,
  isComplete,
  shuffleChoices,
  toPublicQuestion,
} from './game.ts'
import { seededRandom, shuffle } from './shuffle.ts'
import type { GameState, Question } from './types.ts'
import { loadQuestionFile } from './validateQuestions.ts'

const questions = loadQuestionFile(new URL('../../data/questions.json', import.meta.url))
const bank = new Map(questions.map((q) => [q.id, q]))
const originalAnswer = (q: Question) => {
  const original = bank.get(q.id)!
  return original.choices[original.answerIndex]
}

/** Answers every question, correctly when `pickCorrect(i)` is true, `msPerQuestion` apart. */
function play(state: GameState, pickCorrect: (index: number) => boolean, msPerQuestion = 1000): GameState {
  let s = state
  for (let i = 0; i < s.questions.length; i++) {
    const q = currentQuestion(s)!
    s = answerQuestion(s, pickCorrect(i) ? q.answerIndex : (q.answerIndex + 1) % 4, s.startedAt + (i + 1) * msPerQuestion)
  }
  return s
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
    expect(game.questions.map((q) => q.category)).toEqual(CATEGORIES.flatMap((c) => Array(10).fill(c)))
  })

  it('shuffles question order within a category depending on the random function', () => {
    const a = createGame(questions, 'a', { random: seededRandom(1) }).questions.map((q) => q.id)
    const b = createGame(questions, 'b', { random: seededRandom(2) }).questions.map((q) => q.id)
    expect(a).not.toEqual(b)
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('keeps answerIndex pointing at the original correct choice after shuffling choices', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const q of createGame(questions, 'a', { random: seededRandom(seed) }).questions) {
        expect(q.choices[q.answerIndex]).toBe(originalAnswer(q))
        expect([...q.choices].sort()).toEqual([...bank.get(q.id)!.choices].sort())
      }
    }
  })

  it('actually moves choices around for some questions', () => {
    const game = createGame(questions, 'a', { random: seededRandom(3) })
    expect(game.questions.filter((q) => q.answerIndex !== bank.get(q.id)!.answerIndex).length).toBeGreaterThan(0)
  })

  it('can rebuild exactly the same questions from the stored plan', () => {
    const game = createGame(questions, 'a', { random: seededRandom(5) })
    expect(buildQuestions(bank, JSON.parse(JSON.stringify(game.plan)))).toEqual(game.questions)
  })

  it('does not mutate the source questions', () => {
    const before = JSON.stringify(questions)
    createGame(questions, 'a', { random: seededRandom(9) })
    expect(JSON.stringify(questions)).toBe(before)
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
  const fresh = () => createGame(questions, 'a', { random: seededRandom(11), now: 0 })

  it('judges the shuffled correct choice as correct', () => {
    const game = fresh()
    const q = game.questions[0]
    const after = answerQuestion(game, q.answerIndex, 500)
    expect(after.answers).toEqual([{ questionId: q.id, choiceIndex: q.answerIndex, correct: true, answeredAt: 500 }])
    expect(getResult(after).score).toBe(10)
  })

  it('judges any other choice as wrong with no penalty', () => {
    const game = fresh()
    const after = answerQuestion(game, (game.questions[0].answerIndex + 1) % 4, 500)
    expect(after.answers[0].correct).toBe(false)
    expect(getResult(after).score).toBe(0)
  })

  it('answers in order: each call answers the next question, never an earlier one', () => {
    let s = fresh()
    s = answerQuestion(s, 0, 1)
    s = answerQuestion(s, 1, 2)
    expect(s.answers.map((a) => a.questionId)).toEqual([s.questions[0].id, s.questions[1].id])
    expect(currentQuestion(s)).toBe(s.questions[2])
  })

  it('ignores out-of-range choices', () => {
    const game = fresh()
    expect(answerQuestion(game, 4)).toBe(game)
    expect(answerQuestion(game, -1)).toBe(game)
    expect(answerQuestion(game, 1.5)).toBe(game)
  })

  it('does nothing once all 40 questions are answered', () => {
    const done = play(fresh(), () => true)
    expect(isComplete(done)).toBe(true)
    expect(currentQuestion(done)).toBeNull()
    expect(answerQuestion(done, 0)).toBe(done)
  })
})

describe('getResult', () => {
  it('gives 400 points for a perfect game', () => {
    const result = getResult(play(createGame(questions, '만점', { random: seededRandom(4), now: 0 }), () => true))
    expect(result).toMatchObject({ score: 400, correctCount: 40, total: 40 })
    expect(result.correctByCategory).toEqual({ history: 10, science: 10, geography: 10, arts: 10 })
  })

  it('gives 0 points when every answer is wrong', () => {
    const result = getResult(play(createGame(questions, 'a', { random: seededRandom(4), now: 0 }), () => false))
    expect(result).toMatchObject({ score: 0, correctCount: 0 })
  })

  it('counts correct answers per category', () => {
    // Correct on the first 7 history, 3 science, 10 geography, 0 arts.
    const pattern = (i: number) => (i < 10 ? i < 7 : i < 20 ? i < 13 : i < 30)
    const result = getResult(play(createGame(questions, 'a', { random: seededRandom(8), now: 0 }), pattern))
    expect(result.correctByCategory).toEqual({ history: 7, science: 3, geography: 10, arts: 0 })
    expect(result.totalByCategory).toEqual({ history: 10, science: 10, geography: 10, arts: 10 })
    expect(result).toMatchObject({ correctCount: 20, score: 200, nickname: 'a' })
  })

  it('keeps one record per question in play order', () => {
    const s = play(createGame(questions, 'a', { random: seededRandom(3), now: 0 }), (i) => i % 3 === 0)
    const { records } = getResult(s)
    expect(records.map((r) => r.questionId)).toEqual(s.questions.map((q) => q.id))
    expect(records.filter((r) => r.correct)).toHaveLength(14)
    expect(records[0]).not.toHaveProperty('answeredAt')
  })
})

describe('getDurationSec', () => {
  it('measures from creation to the last answer minus four 1-second category intros', () => {
    // Last answer 40 × 2s = 80s after start; minus 4s of intros.
    const s = play(createGame(questions, 'a', { random: seededRandom(2), now: 10_000 }), () => true, 2000)
    expect(getDurationSec(s)).toBe(76)
  })

  it('never goes below zero', () => {
    const s = play(createGame(questions, 'a', { random: seededRandom(2), now: 0 }), () => true, 10)
    expect(getDurationSec(s)).toBe(0)
  })
})

describe('toPublicQuestion', () => {
  it('leaves out the answer, the explanation and the difficulty', () => {
    const pub = toPublicQuestion(questions[0])
    expect(Object.keys(pub).sort()).toEqual(['category', 'choices', 'id', 'question'])
  })
})

describe('isCategoryStart', () => {
  it('marks question 1, 11, 21 and 31 as category starts', () => {
    const game = createGame(questions, 'a', { random: seededRandom(6) })
    const starts = game.questions.map((_, i) => i).filter((i) => isCategoryStart(game.questions, i))
    expect(starts).toEqual([0, 10, 20, 30])
  })
})
