// The period argument shared by the teacher report API, CLI and /teacher-* commands (docs/teacher-mode.md "기간 인자").
// Days are cut in local time; the bounds are UTC ISO strings so they compare directly with scores.played_at.
import type { ReportPeriod } from '../../../shared/types.ts'

export const PERIOD_USAGE = 'all, today, 7d, 30d, YYYY-MM-DD~YYYY-MM-DD (예: 2026-10-01~2026-10-14)'

export class PeriodError extends Error {
  constructor(value: string) {
    super(`기간 "${value}"을(를) 알 수 없습니다. 쓸 수 있는 형식: ${PERIOD_USAGE}`)
    this.name = 'PeriodError'
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD of a moment in local time. */
export function localDate(time: Date | string | number): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight `days` days after the day of `time`. */
function startOfDay(time: Date, days = 0): Date {
  return new Date(time.getFullYear(), time.getMonth(), time.getDate() + days)
}

/** Local midnight of a YYYY-MM-DD date, or null when the date does not exist (e.g. 2026-02-30). */
function parseDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

/**
 * Parses a period argument. An empty value means `all`. `Nd` covers the last N calendar days including today.
 * Throws PeriodError for anything else.
 */
export function parsePeriod(value: string | undefined, now: Date): ReportPeriod {
  const key = (value ?? '').trim() || 'all'
  const range = (label: string, from: Date, to: Date): ReportPeriod => ({
    key,
    label: `${label} (${localDate(from)}~${localDate(to.getTime() - 1)})`,
    from: from.toISOString(),
    to: to.toISOString(),
  })

  if (key === 'all') return { key, label: '전체', from: null, to: null }
  if (key === 'today') return range('오늘', startOfDay(now), startOfDay(now, 1))
  if (key === '7d' || key === '30d') {
    const days = Number.parseInt(key, 10)
    return range(`최근 ${days}일`, startOfDay(now, 1 - days), startOfDay(now, 1))
  }
  const [first, last, extra] = key.split('~')
  const from = first ? parseDate(first) : null
  const until = last ? parseDate(last) : null
  if (extra !== undefined || !from || !until || from > until) throw new PeriodError(key)
  return range('기간', from, startOfDay(until, 1))
}
