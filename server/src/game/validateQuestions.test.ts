import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Question } from './types.ts'
import { loadQuestions, validateQuestions } from './validateQuestions.ts'

const rawQuestions = JSON.parse(
  readFileSync(new URL('../../data/questions.json', import.meta.url), 'utf8'),
) as Question[]

const clone = (): Question[] => structuredClone(rawQuestions) as Question[]

describe('questions.json', () => {
  it('passes validation', () => {
    expect(validateQuestions(rawQuestions)).toEqual([])
  })

  it('has no "all of the above" style choices', () => {
    const banned = /모두 (맞음|정답|옳음)|정답 없음|해당 없음/
    for (const q of rawQuestions) {
      for (const choice of q.choices) expect(choice).not.toMatch(banned)
    }
  })

  it('has an explanation of one or two sentences', () => {
    for (const q of rawQuestions) {
      const sentences = q.explanation.split(/(?<=[.!?])\s+/).filter(Boolean)
      expect(sentences.length, q.id).toBeGreaterThanOrEqual(1)
      expect(sentences.length, q.id).toBeLessThanOrEqual(2)
    }
  })
})

describe('validateQuestions', () => {
  it('rejects non-array data', () => {
    expect(validateQuestions({})).toHaveLength(1)
    expect(() => loadQuestions(null)).toThrow()
  })

  it('reports a wrong number of questions per category', () => {
    const data = clone().filter((q) => q.id !== 'sci-01')
    expect(validateQuestions(data).join('\n')).toMatch(/science: 문제가 10개여야 하는데 9개/)
  })

  it('reports a wrong difficulty mix', () => {
    const data = clone()
    data.find((q) => q.id === 'geo-01')!.difficulty = 'hard'
    const errors = validateQuestions(data).join('\n')
    expect(errors).toMatch(/geography: easy 문제가 4개여야 하는데 3개/)
    expect(errors).toMatch(/geography: hard 문제가 2개여야 하는데 3개/)
  })

  it('reports a question that does not have exactly 4 choices', () => {
    const data = clone()
    data[0].choices = data[0].choices.slice(0, 3)
    expect(validateQuestions(data)).toContain('hist-01: 보기는 4개여야 합니다.')
  })

  it('reports answerIndex out of range', () => {
    const data = clone()
    data[0].answerIndex = 4
    data[1].answerIndex = -1
    const errors = validateQuestions(data)
    expect(errors).toContain('hist-01: answerIndex는 0~3 사이 정수여야 합니다.')
    expect(errors).toContain('hist-02: answerIndex는 0~3 사이 정수여야 합니다.')
  })

  it('reports duplicate ids', () => {
    const data = clone()
    data[1].id = 'hist-01'
    expect(validateQuestions(data)).toContain('hist-01: id가 중복됩니다.')
  })

  it('reports ids that do not match the category prefix', () => {
    const data = clone()
    data[0].id = 'sci-99'
    expect(validateQuestions(data)).toContain('sci-99: id는 hist-NN 형식이어야 합니다.')
  })

  it('reports text over the length limits', () => {
    const data = clone()
    data[0].question = '가'.repeat(81)
    data[0].choices[0] = '가'.repeat(31)
    data[0].explanation = '가'.repeat(121)
    const errors = validateQuestions(data)
    expect(errors).toContain('hist-01: 문제 본문이 80자를 넘습니다(81자).')
    expect(errors).toContain('hist-01: 보기 1이 30자를 넘습니다(31자).')
    expect(errors).toContain('hist-01: 해설이 120자를 넘습니다(121자).')
  })

  it('accepts text exactly at the length limits', () => {
    const data = clone()
    data[0].question = '가'.repeat(80)
    data[0].choices[0] = '가'.repeat(30)
    data[0].explanation = '가'.repeat(120)
    expect(validateQuestions(data)).toEqual([])
  })

  it('reports duplicate choices within a question', () => {
    const data = clone()
    data[0].choices[1] = data[0].choices[0]
    expect(validateQuestions(data)).toContain('hist-01: 같은 보기가 두 번 이상 있습니다.')
  })

  it('reports an unknown category', () => {
    const data = clone()
    ;(data[0] as { category: string }).category = 'sports'
    expect(validateQuestions(data)).toContain('hist-01: 알 수 없는 카테고리입니다: sports')
  })
})
