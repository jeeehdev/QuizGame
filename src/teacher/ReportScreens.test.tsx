// @vitest-environment jsdom
import axe from 'axe-core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTeacherFixture } from '../../server/src/teacher/fixture.ts'
import { installTestServer, serverQuestions, type TestServer } from '../test/testServer'
import TeacherApp from './TeacherApp'

const PASSWORD = 'correct-horse'
// 20:00 local, so every fixture play from the last 8 hours is "today".
const NOW = new Date(2026, 9, 15, 20).getTime()

let server: TestServer

beforeAll(() => {
  // axe probes canvas support, which jsdom does not implement.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

beforeEach(() => {
  server = installTestServer({ teacherPassword: PASSWORD, now: () => NOW })
  buildTeacherFixture(server.db, serverQuestions, NOW)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  server.db.close()
})

async function seriousViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

async function goTo(section: string) {
  fireEvent.click(within(screen.getByRole('navigation', { name: '선생님 메뉴' })).getByRole('button', { name: section }))
  await screen.findByRole('heading', { level: 1, name: section })
}

/** Logs in, opens a section and waits for the report of the whole period. */
async function open(section = '성적표') {
  const view = render(<TeacherApp />)
  fireEvent.change(await screen.findByLabelText('비밀번호'), { target: { value: PASSWORD } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('heading', { level: 1, name: '성적표' })
  if (section !== '성적표') await goTo(section)
  await screen.findByText('3학년 2반')
  return view
}

const table = (caption: RegExp) => screen.getByRole('table', { name: caption })
const bodyRows = (caption: RegExp) => within(table(caption)).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((c) => c.textContent)
/** The report header line (class · period · counts), whose text is split across elements. */
const header = (pattern: RegExp) => screen.getByText((_, el) => el?.tagName === 'P' && pattern.test(el.textContent ?? ''))

describe('성적표', () => {
  it('shows the class summary and every student with grade, rank and rates', async () => {
    await open()
    expect(header(/3학년 2반 · 전체 · 학생 8명 · 응시 7명 · 기록 13건/)).toBeTruthy()
    const summary = screen.getByRole('region', { name: '반 요약' })
    expect(within(summary).getByText('반 평균').nextElementSibling!.textContent).toBe('266점')
    expect(within(summary).getByText('표준편차').nextElementSibling!.textContent).toBe('88')
    expect(within(summary).getByText('A 1명 · B 1명 · C 2명 · D 3명')).toBeTruthy()

    const rows = bodyRows(/학생별 성적표/)
    expect(rows).toHaveLength(8)
    expect(cells(rows[0]).slice(0, 9)).toEqual(['1', '김민수 ', 'C', '3/7', '3', '340', '280', '340', '+14'])
    expect(cells(rows[4])).toEqual(['5', '정도윤 ', '미응시'])
    expect(rows[6].textContent).toMatch(/윤서준 ⚠️\(도움 필요\)/)
    expect(rows[7].textContent).toMatch(/한지민 ⭐\(우수\)/)
    expect(screen.getByText(/명단에 없는 닉네임의 기록 2건/)).toBeTruthy()
  })

  it('sorts by the column header', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '평균' }))
    expect(screen.getByRole('columnheader', { name: '평균' }).getAttribute('aria-sort')).toBe('descending')
    expect(bodyRows(/평균 순/).map((r) => within(r).getByRole('rowheader').textContent!.trim())).toEqual([
      '한지민 ⭐(우수)',
      '이서연 ⭐(우수)',
      '김민수',
      '강하은',
      '최유나',
      '박지훈',
      '윤서준 ⚠️(도움 필요)',
      '정도윤',
    ])
    fireEvent.click(screen.getByRole('button', { name: '등급' }))
    expect(bodyRows(/등급 순/).map((r) => cells(r)[2])).toEqual(['A', 'B', 'C', 'C', 'D', 'D', 'D', '미응시'])
  })

  it('reloads the report when the period changes', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: '오늘' }))
    await waitFor(() => expect(header(/오늘 \(2026-10-15~2026-10-15\) · 학생 8명 · 응시 6명 · 기록 6건/)).toBeTruthy())
    expect(within(screen.getByRole('region', { name: '반 요약' })).getByText('반 평균').nextElementSibling!.textContent).toBe('250점')
    expect(server.calls).toContain('GET /api/teacher/report?period=today')
  })

  it('checks a date range before asking the server', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: '날짜 지정' }))
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(screen.getByRole('alert').textContent).toBe('시작 날짜와 끝 날짜를 모두 입력해 주세요.')
    fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(await screen.findByText('기간 안에 응시 기록이 없습니다.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: '반 요약' })).toBeNull()
  })

  it('keeps the period across report screens', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: '최근 7일' }))
    await waitFor(() => expect(header(/최근 7일 \(2026-10-09~2026-10-15\)/)).toBeTruthy())
    await goTo('추이')
    expect((screen.getByRole('radio', { name: '최근 7일' }) as HTMLInputElement).checked).toBe(true)
    expect(header(/최근 7일 \(2026-10-09~2026-10-15\)/)).toBeTruthy()
  })

  it('shows a student after their nickname is linked in the roster', async () => {
    await open()
    expect(cells(bodyRows(/학생별 성적표/)[2])[4]).toBe('1')
    await goTo('학생 명단')
    const item = (await screen.findByText('지훈2')).closest('li')!
    fireEvent.change(within(item).getByLabelText('지훈2를 연결할 학생'), { target: { value: '3' } })
    fireEvent.click(within(item).getByRole('button', { name: '연결' }))
    await screen.findByText(/지훈2을\(를\) 3번 박지훈 학생에게 연결했습니다/)
    await goTo('성적표')
    await waitFor(() => expect(cells(bodyRows(/학생별 성적표/)[2])[4]).toBe('2'))
  })
})

describe('학생 비교', () => {
  it('starts with the ⚠️ and ⭐ students side by side', async () => {
    await open('학생 비교')
    expect(screen.getByRole('heading', { name: '비교 결과: ⚠️·⭐ 표시된 학생' })).toBeTruthy()
    const headers = within(table(/나란히 보기/)).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['항목', '2 이서연 ⭐(우수)', '7 윤서준 ⚠️(도움 필요)', '8 한지민 ⭐(우수)'])
    const average = bodyRows(/나란히 보기/).find((r) => r.textContent!.startsWith('평균 점수'))!
    expect(cells(average)).toEqual(['평균 점수', '370', '135', '400 (가장 좋음)'])
  })

  it('compares the students the teacher picks', async () => {
    await open('학생 비교')
    for (const name of ['2 이서연', '7 윤서준', '8 한지민']) fireEvent.click(screen.getByRole('checkbox', { name }))
    fireEvent.click(screen.getByRole('button', { name: '비교하기' }))
    expect(screen.getByRole('alert').textContent).toBe('비교하려면 학생을 2명 이상 골라 주세요.')
    fireEvent.click(screen.getByRole('checkbox', { name: '1 김민수' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '4 최유나' }))
    fireEvent.click(screen.getByRole('button', { name: '비교하기' }))
    expect(await screen.findByRole('heading', { name: '비교 결과: 고른 학생' })).toBeTruthy()
    expect(within(table(/나란히 보기/)).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['항목', '1 김민수 ', '4 최유나 '])
    expect(server.calls).toContain('GET /api/teacher/report?period=all&compare=1%2C4')
  })
})

describe('약점', () => {
  it('lists weak categories and the most missed questions with the students who missed them', async () => {
    await open('약점')
    expect(bodyRows(/반 전체 카테고리별 정답률/).map((r) => cells(r)[0])).toEqual(['지리', '예술과 문화', '과학', '한국사'])
    expect(cells(bodyRows(/반 전체 카테고리별 정답률/)[0])[2]).toBe('2명: 3 박지훈, 7 윤서준')
    const geo01 = bodyRows(/오답률이 높은 문제 10개/).find((r) => cells(r)[0] === 'geo-01')!
    expect(geo01.textContent).toMatch(/다시 가르칠 내용/)
    expect(cells(geo01).slice(5)).toEqual(['71% (5/7명)', '김민수, 박지훈, 최유나, 강하은, 윤서준'])
    expect(screen.getByText(/표에 넣지 못한 같은 오답률의 문제: hist-09, hist-10, sci-07, sci-08/)).toBeTruthy()
  })

  it('shows one student against the class and the questions they missed', async () => {
    await open('약점')
    fireEvent.change(screen.getByLabelText('볼 대상'), { target: { value: '3' } })
    expect(cells(bodyRows(/3 박지훈 카테고리별 정답률/)[0])).toEqual(['지리', '20%', '61%', '−41%p'])
    expect(table(/3 박지훈 학생이 최근 게임에서 틀린 문제 22개/)).toBeTruthy()
  })
})

describe('추이', () => {
  it('shows each student’s change and the class average per day', async () => {
    await open('추이')
    const rows = bodyRows(/첫 기록과 최근 기록/)
    expect(cells(rows[0])).toEqual(['1', '김민수', '3', '220', '340', '+120', '340', '📈 향상'])
    expect(cells(rows[3]).at(-1)).toBe('📉 하락')
    expect(screen.getByText('떨어진 학생: 최유나(−110)')).toBeTruthy()
    expect(cells(bodyRows(/기록이 있는 최근 8일/).at(-1)!)).toEqual(['2026-10-15', '250점', '6명'])
  })

  it('shows one student’s records in order', async () => {
    await open('추이')
    fireEvent.change(screen.getByLabelText('볼 대상'), { target: { value: '1' } })
    const rows = bodyRows(/회차별 기록/)
    expect(rows.map((r) => cells(r).slice(0, 5).join(' '))).toEqual(['1회 ' + cells(rows[0])[1] + ' 민수 220 -', expect.stringMatching(/kms01 280 \+60/), expect.stringMatching(/민수 340 \+60/)])
    expect(screen.getByText(/최고 점수: 340점 \(3회차\)/)).toBeTruthy()
  })
})

describe('accessibility', () => {
  it.each(['성적표', '학생 비교', '약점', '추이'])('%s has no serious violations', async (section) => {
    const { container } = await open(section)
    expect(await seriousViolations(container)).toEqual([])
  })
})
