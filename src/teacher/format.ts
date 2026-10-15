// How teacher report values are shown. Same rounding as npm run teacher-report, so the web and /teacher-mode agree.
import { CATEGORIES, CATEGORY_LABELS, type Category, type Difficulty, type ReportStudent, type Trend } from '../types/quiz'

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' }

export const TREND_LABELS: Record<Trend, { icon: string; text: string }> = {
  up: { icon: '📈', text: '향상' },
  down: { icon: '📉', text: '하락' },
  flat: { icon: '➡️', text: '유지' },
}

export const FLAG_LABELS = {
  warning: { icon: '⚠️', text: '도움 필요' },
  star: { icon: '⭐', text: '우수' },
} as const

export const score = (value: number | null) => (value === null ? '-' : String(Math.round(value)))
export const percent = (value: number | null | undefined) => (value === null || value === undefined ? '-' : `${Math.round(value)}%`)

/** +14, −26, ±0 (rounded first, so −0.4 shows as ±0). */
export function signed(value: number | null, unit = ''): string {
  if (value === null) return '-'
  const n = Math.round(value)
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${unit}`
}

/** 8:05 */
export function duration(seconds: number | null): string {
  if (seconds === null) return '-'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 2026-10-15 14:05, local time */
export const localTime = (iso: string) => new Date(iso).toLocaleString('sv-SE').slice(0, 16)

export const studentName = (s: Pick<ReportStudent, 'number' | 'name'>) => `${s.number} ${s.name}`

/** Category names, or 차이 없음 when all four are listed. */
export function categoryList(list: Category[]): string {
  if (list.length === 0) return '-'
  if (list.length === CATEGORIES.length) return '차이 없음'
  return list.map((c) => CATEGORY_LABELS[c]).join(', ')
}
