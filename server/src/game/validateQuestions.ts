import { readFileSync } from 'node:fs'
import { CATEGORIES, type Category } from '../../../shared/types.ts'
import type { Difficulty, Question } from './types.ts'

export const QUESTIONS_PER_CATEGORY = 10
export const CHOICES_PER_QUESTION = 4
export const MAX_QUESTION_LENGTH = 80
export const MAX_CHOICE_LENGTH = 30
export const MAX_EXPLANATION_LENGTH = 120
export const DIFFICULTY_MIX: Record<Difficulty, number> = { easy: 4, medium: 4, hard: 2 }

const ID_PREFIX: Record<Category, string> = { history: 'hist', science: 'sci', geography: 'geo', arts: 'arts' }
const DIFFICULTIES = Object.keys(DIFFICULTY_MIX) as Difficulty[]

/** Counts characters (code points), so emoji or symbols outside the BMP count as one. */
export function charLength(text: string): number {
  return [...text].length
}

/** Returns every problem found in the data; an empty array means the data is valid. */
export function validateQuestions(data: unknown): string[] {
  if (!Array.isArray(data)) return ['문제 데이터가 배열이 아닙니다.']

  const errors: string[] = []
  const seenIds = new Set<string>()
  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [c, { total: 0, easy: 0, medium: 0, hard: 0 }]),
  ) as Record<Category, Record<Difficulty | 'total', number>>

  data.forEach((item: unknown, index) => {
    const q = item as Partial<Question>
    const label = typeof q?.id === 'string' ? q.id : `#${index}`
    const fail = (message: string) => errors.push(`${label}: ${message}`)

    if (typeof q !== 'object' || q === null) return fail('객체가 아닙니다.')

    if (typeof q.id !== 'string' || q.id === '') fail('id가 없습니다.')
    else if (seenIds.has(q.id)) fail('id가 중복됩니다.')
    else seenIds.add(q.id)

    const categoryValid = CATEGORIES.includes(q.category as Category)
    if (!categoryValid) fail(`알 수 없는 카테고리입니다: ${String(q.category)}`)
    else if (typeof q.id === 'string' && !new RegExp(`^${ID_PREFIX[q.category!]}-\\d{2}$`).test(q.id)) {
      fail(`id는 ${ID_PREFIX[q.category!]}-NN 형식이어야 합니다.`)
    }

    const difficultyValid = DIFFICULTIES.includes(q.difficulty as Difficulty)
    if (!difficultyValid) fail(`알 수 없는 난이도입니다: ${String(q.difficulty)}`)

    if (categoryValid) {
      counts[q.category!].total++
      if (difficultyValid) counts[q.category!][q.difficulty!]++
    }

    if (typeof q.question !== 'string' || q.question.trim() === '') fail('문제 본문이 없습니다.')
    else if (charLength(q.question) > MAX_QUESTION_LENGTH) {
      fail(`문제 본문이 ${MAX_QUESTION_LENGTH}자를 넘습니다(${charLength(q.question)}자).`)
    }

    if (!Array.isArray(q.choices) || q.choices.length !== CHOICES_PER_QUESTION) {
      fail(`보기는 ${CHOICES_PER_QUESTION}개여야 합니다.`)
    } else {
      q.choices.forEach((choice, i) => {
        if (typeof choice !== 'string' || choice.trim() === '') fail(`보기 ${i + 1}이 비어 있습니다.`)
        else if (charLength(choice) > MAX_CHOICE_LENGTH) {
          fail(`보기 ${i + 1}이 ${MAX_CHOICE_LENGTH}자를 넘습니다(${charLength(choice)}자).`)
        }
      })
      if (new Set(q.choices).size !== q.choices.length) fail('같은 보기가 두 번 이상 있습니다.')
    }

    if (!Number.isInteger(q.answerIndex) || q.answerIndex! < 0 || q.answerIndex! >= CHOICES_PER_QUESTION) {
      fail(`answerIndex는 0~${CHOICES_PER_QUESTION - 1} 사이 정수여야 합니다.`)
    }

    if (typeof q.explanation !== 'string' || q.explanation.trim() === '') fail('해설이 없습니다.')
    else if (charLength(q.explanation) > MAX_EXPLANATION_LENGTH) {
      fail(`해설이 ${MAX_EXPLANATION_LENGTH}자를 넘습니다(${charLength(q.explanation)}자).`)
    }
  })

  for (const category of CATEGORIES) {
    const count = counts[category]
    if (count.total !== QUESTIONS_PER_CATEGORY) {
      errors.push(`${category}: 문제가 ${QUESTIONS_PER_CATEGORY}개여야 하는데 ${count.total}개입니다.`)
    }
    for (const difficulty of DIFFICULTIES) {
      if (count[difficulty] !== DIFFICULTY_MIX[difficulty]) {
        errors.push(
          `${category}: ${difficulty} 문제가 ${DIFFICULTY_MIX[difficulty]}개여야 하는데 ${count[difficulty]}개입니다.`,
        )
      }
    }
  }

  return errors
}

/** Validates the data and returns it typed, or throws with every problem listed. */
export function loadQuestions(data: unknown): Question[] {
  const errors = validateQuestions(data)
  if (errors.length > 0) throw new Error(`문제 데이터 오류:\n${errors.join('\n')}`)
  return data as Question[]
}

/** Reads and validates the question bank file (server/data/questions.json). */
export function loadQuestionFile(path: string | URL): Question[] {
  return loadQuestions(JSON.parse(readFileSync(path, 'utf8')))
}
