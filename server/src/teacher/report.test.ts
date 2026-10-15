import { describe, expect, it } from 'vitest'
import { CATEGORIES, type Category, type QuizQuestion, type TeacherReport } from '../../../shared/types.ts'
import { openDb } from '../db.ts'
import { loadQuestionFile } from '../game/validateQuestions.ts'
import { buildTeacherFixture } from './fixture.ts'
import { parsePeriod } from './period.ts'
import { buildReport, gradeFor, ReportError, type InputScore, type ReportInput } from './report.ts'
import { getTeacherReport } from './reportData.ts'

const bank = loadQuestionFile(new URL('../../data/questions.json', import.meta.url))
const questions = new Map(bank.map((q) => [q.id, q]))
// 20:00 local, so every fixture play from the last 8 hours falls on the same local day.
const NOW = new Date(2026, 9, 15, 20).getTime()
const HOUR = 60 * 60 * 1000

function fixtureReport(period = 'all', compare?: number[] | 'all'): TeacherReport {
  const db = openDb(':memory:')
  buildTeacherFixture(db, bank, NOW)
  return getTeacherReport(db, parsePeriod(period, new Date(NOW)), NOW, questions, compare)
}

const byName = (report: TeacherReport) => new Map(report.students.map((s) => [s.name, s]))
const namesOf = (report: TeacherReport, ids: number[]) => ids.map((id) => report.students.find((s) => s.id === id)!.name)

describe('teacher report on the teacher-fixture data', () => {
  const report = fixtureReport()
  const s = byName(report)

  it('summarizes the class', () => {
    expect(report.className).toBe('3학년 2반')
    expect(report.summary).toMatchObject({
      studentCount: 8,
      playedCount: 7,
      recordCount: 13,
      unmatchedRecordCount: 2,
      abandonedRecent: 1,
      median: 260,
      highestAverage: 400,
      lowestAverage: 135,
      bestRecord: { score: 400, studentIds: [s.get('한지민')!.id] },
      scoreBands: [0, 2, 1, 3, 1],
      fastCount: 0,
      fastWarning: false,
      gradesAssigned: true,
      gradeCounts: { A: 1, B: 1, C: 2, D: 3 },
      flagsShown: true,
    })
    expect(report.summary.average).toBeCloseTo(266.4, 1)
    expect(report.summary.stdDev).toBeCloseTo(88.0, 1)
  })

  it('counts each student over all their nicknames', () => {
    expect(s.get('김민수')).toMatchObject({ playCount: 3, best: 340, average: 280, recent: 340, first: 220 })
    expect(s.get('김민수')!.records.map((r) => [r.nickname, r.change])).toEqual([['민수', null], ['kms01', 60], ['민수', 60]])
  })

  it('marks ⚠️ and ⭐ one standard deviation from the class average', () => {
    const flagged = report.students.filter((st) => st.flag).map((st) => [st.name, st.flag])
    expect(flagged).toEqual([['이서연', 'star'], ['윤서준', 'warning'], ['한지민', 'star']])
  })

  it('grades by rank among students who played', () => {
    expect(report.students.map((st) => [st.name, st.rank, st.grade])).toEqual([
      ['김민수', 3, 'C'],
      ['이서연', 2, 'B'],
      ['박지훈', 6, 'D'],
      ['최유나', 5, 'D'],
      ['정도윤', null, null],
      ['강하은', 4, 'C'],
      ['윤서준', 7, 'D'],
      ['한지민', 1, 'A'],
    ])
  })

  it('shows 미응시 students without values', () => {
    expect(s.get('정도윤')).toMatchObject({ playCount: 0, average: null, categoryRates: null, trend: null, records: [] })
  })

  it('finds trends from the first and the most recent score', () => {
    expect(report.students.map((st) => [st.name, st.trend, st.change])).toEqual([
      ['김민수', 'up', 120],
      ['이서연', 'flat', 20],
      ['박지훈', null, null],
      ['최유나', 'down', -110],
      ['정도윤', null, null],
      ['강하은', null, null],
      ['윤서준', 'up', 30],
      ['한지민', null, null],
    ])
  })

  it('compares category rates of the first and the last record when there are fewer than 4', () => {
    // 최유나: geography 8 → 4 correct
    expect(s.get('최유나')!.categoryChange!.geography).toBeCloseTo(-40)
  })

  it('finds strong and weak categories', () => {
    expect(s.get('박지훈')).toMatchObject({ strongCategories: ['history', 'science'], weakCategories: ['geography'] })
    expect(s.get('한지민')!.strongCategories).toEqual([...CATEGORIES])
    expect(report.summary.below50.geography).toEqual([s.get('박지훈')!.id, s.get('윤서준')!.id])
  })

  it('averages each day over the students who played that day', () => {
    expect(report.daily.at(-1)).toEqual({ date: '2026-10-15', average: 250, studentCount: 6 })
    expect(report.daily.map((d) => d.date)).toEqual([
      '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15',
    ])
  })

  it('analyses questions from the latest game of each student in the last 24 hours', () => {
    const w = report.weakness
    expect(namesOf(report, w.studentIds)).toEqual(['김민수', '이서연', '박지훈', '최유나', '강하은', '윤서준'])
    expect(w.questions).toHaveLength(10)
    const geo01 = w.questions.find((q) => q.questionId === 'geo-01')!
    expect(geo01).toMatchObject({ difficulty: 'easy', solvedBy: 6, wrongBy: 5, reteach: true })
    expect(namesOf(report, geo01.wrongStudentIds)).not.toContain('이서연')
    expect(w.questions.find((q) => q.questionId === 'hist-01')).toMatchObject({ wrongBy: 5, reteach: true })
    expect(w.tiedQuestionIds.length).toBeGreaterThan(0)
    expect(w.wrongByStudent[s.get('이서연')!.id]).not.toContain('geo-01')
  })

  it('compares the ⚠️ and ⭐ students by default', () => {
    expect(report.compare!.reason).toBe('flagged')
    expect(namesOf(report, report.compare!.studentIds)).toEqual(['이서연', '윤서준', '한지민'])
    expect(namesOf(report, report.compare!.best.average!)).toEqual(['한지민'])
    expect(namesOf(report, report.compare!.best.averageDurationSec!)).toEqual(['한지민'])
  })

  it('compares the students asked for', () => {
    const r = fixtureReport('all', [1, 4])
    expect(r.compare).toMatchObject({ reason: 'requested' })
    // Over the whole period they differ by less than 20%p in every category.
    expect(r.compare!.gaps).toEqual([])
    // 김민수 is strong in history and arts; 최유나 is weak in geography only.
    expect(r.compare!.teachingPairs).toEqual([])
  })

  it('applies the period to every value', () => {
    const today = fixtureReport('today')
    expect(today.summary).toMatchObject({ playedCount: 6, recordCount: 6, unmatchedRecordCount: 2, average: 250 })
    expect(byName(today).get('김민수')).toMatchObject({ playCount: 1, trend: null })
    // Per-question analysis always uses the last 24 hours.
    expect(today.weakness.studentIds).toEqual(report.weakness.studentIds)

    const week = fixtureReport('7d')
    expect(byName(week).get('김민수')).toMatchObject({ playCount: 2, first: 280 })
  })

  it('reports an empty period without NaN', () => {
    const empty = fixtureReport('2026-01-01~2026-01-02')
    expect(empty.summary).toMatchObject({ playedCount: 0, recordCount: 0, average: null, stdDev: null, median: null, bestRecord: null, categoryRates: null })
    expect(empty.compare).toBeNull()
    expect(empty.compareSkipped).toMatch(/2명 미만/)
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/)
  })
})

// ---- Small classes built directly as input ----

let nextId = 1
function score(nickname: string, total: number, { hoursAgo = 1, durationSec = 300, byCategory }: { hoursAgo?: number; durationSec?: number; byCategory?: number[] } = {}): InputScore {
  const counts = byCategory ?? CATEGORIES.map(() => total / 40)
  return {
    id: nextId++,
    nickname,
    score: total,
    correctByCategory: Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]])) as Record<Category, number>,
    durationSec,
    playedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  }
}

/** One student per score list, nicknamed s1, s2, … */
function classInput(scoresByStudent: InputScore[][], extra: Partial<ReportInput> = {}): ReportInput {
  return {
    className: '테스트반',
    period: parsePeriod('all', new Date(NOW)),
    now: NOW,
    students: scoresByStudent.map((_, i) => ({ id: i + 1, number: i + 1, name: `학생${i + 1}`, nicknames: [`s${i + 1}`] })),
    scores: scoresByStudent.flat(),
    recentGames: [],
    abandonedNicknames: [],
    questions: new Map<string, QuizQuestion>(),
    ...extra,
  }
}
const withScores = (...totals: number[]) => classInput(totals.map((t, i) => [score(`s${i + 1}`, t)]))

describe('rules for small classes', () => {
  it.each([
    [1, false, false],
    [2, false, false],
    [4, true, false],
    [5, true, true],
  ])('with %i students: flags %s, grades %s', (count, flags, grades) => {
    const totals = [400, 300, 200, 100, 0].slice(0, count)
    const report = buildReport(withScores(...totals))
    expect(report.summary.flagsShown).toBe(flags)
    expect(report.summary.stdDev === null).toBe(!flags)
    expect(report.summary.gradesAssigned).toBe(grades)
    expect(report.students.every((st) => st.grade !== null)).toBe(grades)
    if (!flags) expect(report.students.every((st) => st.flag === null)).toBe(true)
    expect(report.students.every((st) => st.rank !== null)).toBe(true)
  })

  it('does not compare by default with one student', () => {
    expect(buildReport(withScores(300)).compare).toBeNull()
    expect(buildReport(withScores(300, 200)).compare).toMatchObject({ reason: 'topBottom', studentIds: [1, 2] })
  })

  it('flags nobody when every average is the same', () => {
    const report = buildReport(withScores(200, 200, 200))
    expect(report.summary.stdDev).toBe(0)
    expect(report.students.every((st) => st.flag === null)).toBe(true)
  })

  it('gives tied averages the same rank and grade (RANK)', () => {
    // docs/teacher-mode.md: 10 students, two at rank 2 are both A, the next is rank 4 (B).
    const report = buildReport(withScores(400, 350, 350, 300, 250, 200, 150, 100, 50, 0))
    expect(report.students.map((st) => st.rank)).toEqual([1, 2, 2, 4, 5, 6, 7, 8, 9, 10])
    expect(report.students.map((st) => st.grade)).toEqual(['A', 'A', 'A', 'B', 'C', 'C', 'C', 'D', 'D', 'D'])
  })

  it('maps rank to grade by the top percentage', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => gradeFor(rank, 10))).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'D'])
    expect(gradeFor(1, 5)).toBe('A')
    expect(gradeFor(5, 5)).toBe('D')
  })

  it('keeps fast records in every value but warns when half or more are fast', () => {
    const report = buildReport(classInput([[score('s1', 400, { durationSec: 60 }), score('s1', 200, { hoursAgo: 2 })], [score('s2', 100)]]))
    expect(report.students[0]).toMatchObject({ average: 300, fastCount: 1 })
    expect(report.summary).toMatchObject({ fastCount: 1, recordCount: 3, fastWarning: false })
    const mostlyFast = buildReport(classInput([[score('s1', 400, { durationSec: 79 })], [score('s2', 100, { durationSec: 80 })]]))
    expect(mostlyFast.summary.fastWarning).toBe(true)
  })

  it('leaves out records of nicknames not on the roster', () => {
    const report = buildReport(classInput([[score('s1', 300)], [score('s2', 100)]], {}))
    const withGuest = buildReport({ ...classInput([[score('s1', 300)], [score('s2', 100)]]), scores: [score('s1', 300), score('s2', 100), score('손님', 0)] })
    expect(withGuest.summary.average).toBe(report.summary.average)
    expect(withGuest.summary.unmatchedRecordCount).toBe(1)
  })

  it('compares the first two and the last two records once there are 4', () => {
    const records = [0, 1, 2, 3].map((i) => score('s1', 0, { hoursAgo: 10 - i, byCategory: [i * 2, 0, 0, 0] }))
    const report = buildReport(classInput([records]))
    // history: (0 + 2) / 2 = 10% → (4 + 6) / 2 = 50%
    expect(report.students[0].categoryChange!.history).toBeCloseTo(40)
  })
})

describe('per-question analysis', () => {
  const easy: QuizQuestion = { id: 'q-easy', category: 'history', difficulty: 'easy', question: '쉬운 문제', choices: ['가', '나', '다', '라'], answerIndex: 1, explanation: '' }
  const hard: QuizQuestion = { ...easy, id: 'q-hard', difficulty: 'hard', question: '어려운 문제' }
  const game = (nickname: string, hoursAgo: number, correct: boolean, durationSec = 300) => ({
    scoreId: nextId++,
    nickname,
    playedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    durationSec,
    answers: [
      { questionId: 'q-easy', correct },
      { questionId: 'q-hard', correct: false },
      { questionId: 'gone-01', correct: false },
    ],
  })
  const input = (games: ReturnType<typeof game>[]) =>
    classInput([[score('s1', 100)], [score('s2', 100)], [score('s3', 100)]], {
      recentGames: games,
      questions: new Map([easy, hard].map((q) => [q.id, q])),
    })

  it('counts each student once, by their latest game', () => {
    // s1 got q-easy wrong earlier but right in the latest game; three earlier wrong games would otherwise dominate.
    const report = buildReport(input([game('s1', 5, false), game('s1', 4, false), game('s1', 3, false), game('s1', 1, true), game('s2', 2, false), game('s3', 2, false, 60), game('손님', 1, false)]))
    expect(report.weakness.studentIds).toEqual([1, 2, 3])
    expect(report.weakness.fastStudentIds).toEqual([3])
    expect(report.weakness.questions.map((q) => [q.questionId, q.solvedBy, q.wrongBy, q.reteach])).toEqual([
      ['q-hard', 3, 3, false],
      ['q-easy', 3, 2, true],
    ])
    expect(report.weakness.questions[1]).toMatchObject({ answer: '나', wrongStudentIds: [2, 3] })
    expect(report.weakness.wrongByStudent[1]).toEqual(['q-hard'])
    expect(Object.keys(report.weakness.questionDetails).sort()).toEqual(['q-easy', 'q-hard'])
  })

  it('needs 3 students before giving a wrong rate', () => {
    const report = buildReport(input([game('s1', 1, false), game('s2', 1, false)]))
    expect(report.weakness.questions).toEqual([])
    expect(report.weakness.wrongByStudent[1]).toEqual(['q-easy', 'q-hard'])
  })
})

describe('choosing students to compare', () => {
  const input = withScores(400, 300, 250, 200, 100)

  it('takes the top 2 and bottom 2 when fewer than 2 are flagged', () => {
    const report = buildReport(withScores(300, 290, 280, 270, 100))
    expect(report.compare).toMatchObject({ reason: 'topBottom', studentIds: [1, 2, 4, 5] })
  })

  it('finds close scores and teaching pairs', () => {
    const report = buildReport(
      classInput([
        [score('s1', 200, { byCategory: [8, 2, 5, 5], durationSec: 400 })],
        [score('s2', 200, { byCategory: [2, 8, 5, 5], durationSec: 300 })],
      ]),
      [1, 2],
    )
    expect(report.compare!.closeScores).toEqual([{ studentIds: [1, 2], scoreDifference: 0, durationDifference: 100 }])
    expect(report.compare!.teachingPairs).toEqual([
      { tutorId: 1, learnerId: 2, category: 'history' },
      { tutorId: 2, learnerId: 1, category: 'science' },
    ])
    expect(report.compare!.gaps.map((g) => [g.category, g.difference, g.highIds, g.lowIds])).toEqual([
      ['history', 60, [1], [2]],
      ['science', 60, [2], [1]],
    ])
  })

  it('accepts all students who played', () => {
    expect(buildReport(input, 'all').compare!.studentIds).toEqual([1, 2, 3, 4, 5])
  })

  it.each([
    [[1], 'INVALID_REQUEST'],
    [[1, 1], 'INVALID_REQUEST'],
    [[1, 9], 'STUDENT_NOT_FOUND'],
  ] as const)('rejects %j', (request, code) => {
    expect(() => buildReport(input, [...request])).toThrow(ReportError)
    try {
      buildReport(input, [...request])
    } catch (error) {
      expect((error as ReportError).code).toBe(code)
    }
  })
})
