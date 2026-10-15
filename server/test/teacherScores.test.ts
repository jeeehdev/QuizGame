import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorBody, TeacherScoreEntry, TeacherScoresResponse } from '../../shared/types.ts'
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

const list = async (query = '') => (await request(app).get(`/api/teacher/scores${query}`).set('Cookie', cookie).expect(200)).body as TeacherScoresResponse
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n

describe('GET /api/teacher/scores', () => {
  it('needs a teacher session', async () => {
    await request(app).get('/api/teacher/scores').expect(401)
    await request(app).delete('/api/teacher/scores/1').expect(401)
  })

  it('lists records newest first with the student who uses the nickname', async () => {
    const { entries, total } = await list()
    expect(total).toBe(15)
    expect(entries).toHaveLength(15)
    expect(entries[0]).toMatchObject({ nickname: '유나', student: { number: 4, name: '최유나' }, score: 190, fast: false })
    expect(entries.find((e) => e.nickname === '손님1')!.student).toBeNull()
    const times = entries.map((e) => e.playedAt)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('finds records by nickname or student name', async () => {
    expect((await list('?q=' + encodeURIComponent('민수'))).entries.map((e) => e.nickname).sort()).toEqual(['kms01', '민수', '민수'])
    expect((await list('?q=' + encodeURIComponent('최유나'))).total).toBe(3)
    expect((await list('?q=' + encodeURIComponent('지훈'))).entries.map((e) => e.nickname).sort()).toEqual(['지훈', '지훈2'])
    // LIKE wildcards are searched as text.
    expect((await list('?q=%25')).total).toBe(0)
  })

  it('keeps only fast records when asked', async () => {
    db.prepare(
      "INSERT INTO scores (nickname, score, correct_by_category, duration_sec, played_at) VALUES ('빠름', 100, '{}', 79, '2026-10-15T00:00:00.000Z')",
    ).run()
    const { entries, total } = await list('?fast=1')
    expect(total).toBe(1)
    expect(entries[0]).toMatchObject({ nickname: '빠름', fast: true })
  })
})

describe('DELETE /api/teacher/scores/:id', () => {
  it('deletes the record with its per-question answers and keeps the others', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const target = (await list()).entries[0]
    const res = await request(app).delete(`/api/teacher/scores/${target.id}`).set('Cookie', cookie).expect(200)
    expect(res.body as TeacherScoreEntry).toEqual(target)
    expect((await list()).total).toBe(14)
    expect(count(`SELECT COUNT(*) AS n FROM score_answers WHERE score_id = ${target.id}`)).toBe(0)
    expect(count('SELECT COUNT(*) AS n FROM score_answers')).toBe(14 * 40)
    // The game row that pointed at the record stays, without the link.
    expect(count(`SELECT COUNT(*) AS n FROM games WHERE score_id = ${target.id}`)).toBe(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Teacher deleted score #${target.id}`))
    log.mockRestore()
  })

  it.each(['9999', 'abc', '0'])('answers 404 for record %s', async (id) => {
    const res = await request(app).delete(`/api/teacher/scores/${id}`).set('Cookie', cookie).expect(404)
    expect((res.body as ApiErrorBody).error).toBe('NOT_FOUND')
  })

  it('answers 404 when the record was already deleted', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { id } = (await list()).entries[0]
    await request(app).delete(`/api/teacher/scores/${id}`).set('Cookie', cookie).expect(200)
    await request(app).delete(`/api/teacher/scores/${id}`).set('Cookie', cookie).expect(404)
    vi.restoreAllMocks()
  })
})
