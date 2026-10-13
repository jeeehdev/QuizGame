import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Question } from '../src/game/types.ts'
import { validateCandidates } from '../src/game/validateQuestions.ts'
import {
  formatQuestionFile,
  nextQuestionId,
  QuestionBankError,
  swapQuestion,
  swapQuestionFiles,
} from '../src/questionBank.ts'

const bankPath = new URL('../data/questions.json', import.meta.url)
const candidatesPath = new URL('../data/question-candidates.json', import.meta.url)
const bankText = readFileSync(bankPath, 'utf8')
const bank = JSON.parse(bankText) as Question[]

/** A candidate copied from a bank question with a new id and question text. */
function candidateFrom(bankId: string, id: string): Question {
  const source = bank.find((q) => q.id === bankId)!
  return { ...structuredClone(source), id, question: `${source.question} (후보 ${id})` }
}

describe('question-candidates.json', () => {
  it('passes validation against the bank', () => {
    expect(validateCandidates(JSON.parse(readFileSync(candidatesPath, 'utf8')), bank)).toEqual([])
  })
})

describe('validateCandidates', () => {
  it('applies the per-question rules but not the per-category counts', () => {
    expect(validateCandidates([candidateFrom('geo-01', 'geo-11')], bank)).toEqual([])
    const tooLong = { ...candidateFrom('geo-01', 'geo-11'), question: '가'.repeat(81) }
    expect(validateCandidates([tooLong], bank)).toContain('geo-11: 문제 본문이 80자를 넘습니다(81자).')
  })

  it('reports ids already used in the bank', () => {
    expect(validateCandidates([candidateFrom('geo-01', 'geo-01')], bank)).toContain('geo-01: 출제 문제와 id가 겹칩니다.')
  })
})

describe('nextQuestionId', () => {
  it('continues after the highest number in any pool', () => {
    expect(nextQuestionId('geography', bank)).toBe('geo-11')
    expect(nextQuestionId('geography', bank, [candidateFrom('geo-01', 'geo-12')])).toBe('geo-13')
    expect(nextQuestionId('history', [])).toBe('hist-01')
  })
})

describe('swapQuestion', () => {
  it('puts the candidate in the same position and moves the old question to the candidates', () => {
    const candidate = candidateFrom('geo-01', 'geo-11')
    const result = swapQuestion(bank, [candidate], 'geo-01', 'geo-11')
    const index = bank.findIndex((q) => q.id === 'geo-01')
    expect(result.bank[index]).toEqual(candidate)
    expect(result.bank).toHaveLength(bank.length)
    expect(result.candidates.map((q) => q.id)).toEqual(['geo-01'])
    expect(result.removed.id).toBe('geo-01')
    expect(result.added.id).toBe('geo-11')
  })

  it('does not change its inputs', () => {
    const candidates = [candidateFrom('geo-01', 'geo-11')]
    swapQuestion(bank, candidates, 'geo-01', 'geo-11')
    expect(bank.some((q) => q.id === 'geo-11')).toBe(false)
    expect(candidates.map((q) => q.id)).toEqual(['geo-11'])
  })

  it('rejects a candidate with a different difficulty or category', () => {
    const hard = { ...candidateFrom('geo-01', 'geo-11'), difficulty: 'hard' as const }
    expect(() => swapQuestion(bank, [hard], 'geo-01', 'geo-11')).toThrow(/카테고리와 난이도가 같은 문제끼리만/)
    expect(() => swapQuestion(bank, [candidateFrom('geo-01', 'geo-11')], 'hist-01', 'geo-11')).toThrow(QuestionBankError)
  })

  it('rejects unknown ids', () => {
    expect(() => swapQuestion(bank, [], 'geo-99', 'geo-11')).toThrow('출제 문제에서 geo-99를 찾을 수 없습니다.')
    expect(() => swapQuestion(bank, [], 'geo-01', 'geo-11')).toThrow('후보 문제에서 geo-11를 찾을 수 없습니다.')
  })

  it('rejects a candidate that would make the bank invalid', () => {
    const broken = { ...candidateFrom('geo-01', 'geo-11'), choices: ['하나', '둘', '셋'] }
    expect(() => swapQuestion(bank, [broken], 'geo-01', 'geo-11')).toThrow(/보기는 4개여야 합니다/)
  })
})

describe('formatQuestionFile', () => {
  it('writes the bank exactly as it is stored', () => {
    expect(formatQuestionFile(bank)).toBe(bankText)
    expect(formatQuestionFile([])).toBe('[]\n')
  })
})

describe('swapQuestionFiles', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('writes both files and leaves them unchanged when the swap is rejected', () => {
    dir = mkdtempSync(join(tmpdir(), 'quiz-bank-'))
    const bankFile = join(dir, 'questions.json')
    const candidatesFile = join(dir, 'question-candidates.json')
    writeFileSync(bankFile, bankText)
    writeFileSync(candidatesFile, formatQuestionFile([candidateFrom('geo-01', 'geo-11')]))

    expect(() => swapQuestionFiles(bankFile, candidatesFile, 'hist-01', 'geo-11')).toThrow(QuestionBankError)
    expect(readFileSync(bankFile, 'utf8')).toBe(bankText)

    swapQuestionFiles(bankFile, candidatesFile, 'geo-01', 'geo-11')
    const nextBank = JSON.parse(readFileSync(bankFile, 'utf8')) as Question[]
    const nextCandidates = JSON.parse(readFileSync(candidatesFile, 'utf8')) as Question[]
    expect(nextBank.some((q) => q.id === 'geo-11')).toBe(true)
    expect(nextBank.some((q) => q.id === 'geo-01')).toBe(false)
    expect(nextCandidates.map((q) => q.id)).toEqual(['geo-01'])
  })
})
