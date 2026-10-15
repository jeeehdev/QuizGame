import { describe, expect, it } from 'vitest'
import { localDate, parsePeriod, PeriodError } from './period.ts'

// Local time, so the tests mean the same thing in any time zone.
const now = new Date(2026, 9, 15, 20, 30)
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

describe('parsePeriod', () => {
  it('treats an empty value as all', () => {
    expect(parsePeriod(undefined, now)).toEqual({ key: 'all', label: '전체', from: null, to: null })
    expect(parsePeriod('  ', now).key).toBe('all')
  })

  it('cuts today at local midnight', () => {
    expect(parsePeriod('today', now)).toEqual({
      key: 'today',
      label: '오늘 (2026-10-15~2026-10-15)',
      from: local(2026, 10, 15),
      to: local(2026, 10, 16),
    })
  })

  it('counts 7d and 30d as calendar days including today', () => {
    expect(parsePeriod('7d', now)).toMatchObject({ label: '최근 7일 (2026-10-09~2026-10-15)', from: local(2026, 10, 9), to: local(2026, 10, 16) })
    expect(parsePeriod('30d', now)).toMatchObject({ from: local(2026, 9, 16), to: local(2026, 10, 16) })
  })

  it('includes both ends of a date range', () => {
    expect(parsePeriod('2026-10-01~2026-10-14', now)).toEqual({
      key: '2026-10-01~2026-10-14',
      label: '기간 (2026-10-01~2026-10-14)',
      from: local(2026, 10, 1),
      to: local(2026, 10, 15),
    })
    expect(parsePeriod('2026-10-03~2026-10-03', now).to).toBe(local(2026, 10, 4))
  })

  it.each(['week', '14d', '2026-10-14~2026-10-01', '2026-02-30~2026-03-01', '2026-10-01', '2026-10-01~', '1~2~3', '2026-1-1~2026-1-2'])(
    'rejects %s',
    (value) => {
      expect(() => parsePeriod(value, now)).toThrow(PeriodError)
    },
  )
})

describe('localDate', () => {
  it('formats a time as a local date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
