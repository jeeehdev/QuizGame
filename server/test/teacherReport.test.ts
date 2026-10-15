import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiErrorBody, TeacherReport } from '../../shared/types.ts'
import { createApp } from '../src/app.ts'
import { openDb, type Db } from '../src/db.ts'
import { loadQuestionFile } from '../src/game/validateQuestions.ts'
import { buildTeacherFixture } from '../src/teacher/fixture.ts'
import { SESSION_COOKIE } from '../src/teacherAuth.ts'

const questions = loadQuestionFile(new URL('../data/questions.json', import.meta.url))
const PASSWORD = 'correct-horse'
const NOW = new Date(2026, 9, 15, 20).getTime()

let db: Db
let app: ReturnType<typeof createApp>
let cookie: string

beforeEach(async () => {
  db = openDb(':memory:')
  buildTeacherFixture(db, questions, NOW)
  app = createApp({ db, questions, bannedWords: [], teacherPassword: PASSWORD, now: () => NOW })
  const res = await request(app).post('/api/teacher/login').send({ password: PASSWORD }).expect(204)
  cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(SESSION_COOKIE))!.split(';')[0]
})

const get = (query: string) => request(app).get(`/api/teacher/report${query}`).set('Cookie', cookie)

describe('GET /api/teacher/report', () => {
  it('needs a teacher session', async () => {
    const res = await request(app).get('/api/teacher/report').expect(401)
    expect((res.body as ApiErrorBody).error).toBe('UNAUTHORIZED')
  })

  it('returns the whole report for all records by default', async () => {
    const report = (await get('').expect(200)).body as TeacherReport
    expect(report.period.key).toBe('all')
    expect(report.summary).toMatchObject({ studentCount: 8, playedCount: 7, recordCount: 13, gradeCounts: { A: 1, B: 1, C: 2, D: 3 } })
    expect(report.summary.average).toBeCloseTo(266.4, 1)
    expect(report.students.filter((s) => s.flag === 'warning').map((s) => s.name)).toEqual(['윤서준'])
    expect(report.weakness.questions[0].question).toBeTruthy()
    expect(report.compare!.reason).toBe('flagged')
  })

  it('applies the period', async () => {
    const report = (await get('?period=today').expect(200)).body as TeacherReport
    expect(report.period.label).toBe('오늘 (2026-10-15~2026-10-15)')
    expect(report.summary).toMatchObject({ playedCount: 6, recordCount: 6, average: 250 })
  })

  it('compares the students asked for by 출석 번호', async () => {
    const report = (await get('?compare=1,%204').expect(200)).body as TeacherReport
    expect(report.compare).toMatchObject({ reason: 'requested', studentIds: [1, 4].map((n) => report.students.find((s) => s.number === n)!.id) })
  })

  it.each([
    ['?period=week', 400, 'INVALID_PERIOD'],
    ['?period=2026-10-14~2026-10-01', 400, 'INVALID_PERIOD'],
    ['?period=all&period=today', 400, 'INVALID_REQUEST'],
    ['?compare=1,a', 400, 'INVALID_REQUEST'],
    ['?compare=1', 400, 'INVALID_REQUEST'],
    ['?compare=1,99', 404, 'STUDENT_NOT_FOUND'],
  ])('rejects %s', async (query, status, code) => {
    const res = await get(query).expect(status)
    expect((res.body as ApiErrorBody).error).toBe(code)
  })
})
