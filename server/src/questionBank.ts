// Moves questions between the question bank (questions.json) and the candidate pool (question-candidates.json).
// The swap-question CLI uses this; a teacher mode can call the same functions later.
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Category } from '../../shared/types.ts'
import type { Question } from './game/types.ts'
import { ID_PREFIX, loadQuestions, validateCandidates, validateQuestions } from './game/validateQuestions.ts'

export class QuestionBankError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuestionBankError'
  }
}

export interface SwapResult {
  bank: Question[]
  candidates: Question[]
  /** The question that left the bank and is now a candidate. */
  removed: Question
  /** The candidate that took its place in the bank. */
  added: Question
}

/** The next unused id for a category across all given pools, e.g. "geo-11" when geo-01..geo-10 exist. */
export function nextQuestionId(category: Category, ...pools: readonly Question[][]): string {
  const prefix = ID_PREFIX[category]
  const pattern = new RegExp(`^${prefix}-(\\d{2})$`)
  const used = pools.flat().map((q) => Number(pattern.exec(q.id)?.[1] ?? 0))
  const next = Math.max(0, ...used) + 1
  if (next > 99) throw new QuestionBankError(`${category}: 더 쓸 수 있는 id가 없습니다(${prefix}-99까지 사용).`)
  return `${prefix}-${String(next).padStart(2, '0')}`
}

/**
 * Puts a candidate into the bank in place of a question with the same category and difficulty, and moves that
 * question to the candidate pool. Ids stay with their questions, so games stored with the old id never get graded
 * against a different question. Both results are validated; nothing is returned unless both are valid.
 */
export function swapQuestion(
  bank: readonly Question[],
  candidates: readonly Question[],
  bankId: string,
  candidateId: string,
): SwapResult {
  const index = bank.findIndex((q) => q.id === bankId)
  if (index === -1) throw new QuestionBankError(`출제 문제에서 ${bankId}를 찾을 수 없습니다.`)
  const added = candidates.find((q) => q.id === candidateId)
  if (!added) throw new QuestionBankError(`후보 문제에서 ${candidateId}를 찾을 수 없습니다.`)
  const removed = bank[index]
  if (removed.category !== added.category || removed.difficulty !== added.difficulty) {
    throw new QuestionBankError(
      `카테고리와 난이도가 같은 문제끼리만 바꿀 수 있습니다: ${bankId}(${removed.category}·${removed.difficulty}), ` +
        `${candidateId}(${added.category}·${added.difficulty})`,
    )
  }

  const nextBank = bank.with(index, added)
  const nextCandidates = [...candidates.filter((q) => q.id !== candidateId), removed]
  const bankErrors = validateQuestions(nextBank)
  if (bankErrors.length > 0) throw new QuestionBankError(`문제 데이터 오류:\n${bankErrors.join('\n')}`)
  const errors = validateCandidates(nextCandidates, nextBank)
  if (errors.length > 0) throw new QuestionBankError(`후보 문제 데이터 오류:\n${errors.join('\n')}`)
  return { bank: nextBank, candidates: nextCandidates, removed, added }
}

/** Serializes questions the way the data files are written: two-space indent, choices on one line. */
export function formatQuestionFile(questions: readonly Question[]): string {
  if (questions.length === 0) return '[]\n'
  const items = questions.map((q) => {
    const marker = '__CHOICES__'
    const json = JSON.stringify({ ...q, choices: marker }, null, 2)
    const choices = `[${q.choices.map((c) => JSON.stringify(c)).join(', ')}]`
    return json.replace(`"${marker}"`, () => choices).replaceAll('\n', '\n  ')
  })
  return `[\n  ${items.join(',\n  ')}\n]\n`
}

/** Reads and validates the candidate pool against the bank it belongs to. */
export function loadCandidateFile(path: string | URL, bank: readonly Question[]): Question[] {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const errors = validateCandidates(data, bank)
  if (errors.length > 0) throw new QuestionBankError(`후보 문제 데이터 오류:\n${errors.join('\n')}`)
  return data as Question[]
}

const filePath = (path: string | URL) => (typeof path === 'string' ? path : fileURLToPath(path))

/**
 * Swaps a bank question with a candidate in the two data files. The CLI needs a server restart to take effect;
 * the teacher API also updates the running server.
 *
 * Both files are written to temporary files first and then renamed over the originals, so a failed write never
 * leaves a half-written file. Only a crash between the two renames can leave them out of step; the next start
 * then stops with a duplicate-id error, and the files can be restored from git.
 */
export function swapQuestionFiles(
  bankPath: string | URL,
  candidatesPath: string | URL,
  bankId: string,
  candidateId: string,
): SwapResult {
  const bank = loadQuestions(JSON.parse(readFileSync(bankPath, 'utf8')))
  const candidates = loadCandidateFile(candidatesPath, bank)
  const result = swapQuestion(bank, candidates, bankId, candidateId)
  const writes = [
    { target: filePath(bankPath), text: formatQuestionFile(result.bank) },
    { target: filePath(candidatesPath), text: formatQuestionFile(result.candidates) },
  ].map((w) => ({ ...w, temp: `${w.target}.${process.pid}.tmp` }))
  try {
    for (const w of writes) writeFileSync(w.temp, w.text)
  } catch (error) {
    for (const w of writes) rmSync(w.temp, { force: true })
    throw error
  }
  for (const w of writes) renameSync(w.temp, w.target)
  return result
}
