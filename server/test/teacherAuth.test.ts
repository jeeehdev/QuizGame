import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { openDb, type Db } from '../src/db.ts'
import { loadQuestionFile } from '../src/game/validateQuestions.ts'
import {
  deleteExpiredSessions,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
} from '../src/teacherAuth.ts'

const questions = loadQuestionFile(new URL('../data/questions.json', import.meta.url))
const PASSWORD = 'correct-horse'

let db: Db
let clock: number
let app: ReturnType<typeof createApp>

function makeApp(options: { teacherPassword?: string; secureCookies?: boolean } = { teacherPassword: PASSWORD }) {
  return createApp({ db, questions, bannedWords: [], now: () => clock, ...options })
}

beforeEach(() => {
  db = openDb(':memory:')
  clock = Date.UTC(2026, 9, 14, 12, 0, 0)
  app = makeApp()
})

const login = (password = PASSWORD) => request(app).post('/api/teacher/login').send({ password })

/** The session cookie as a request header value ("teacher_session=..."). */
async function loggedInCookie(): Promise<string> {
  const res = await login()
  expect(res.status).toBe(204)
  const setCookie = res.headers['set-cookie'] as unknown as string[]
  return setCookie.find((c) => c.startsWith(SESSION_COOKIE + '='))!.split(';')[0]
}

describe('teacher mode off', () => {
  it('answers 404 for every teacher route without TEACHER_PASSWORD', async () => {
    app = makeApp({})
    expect((await login()).status).toBe(404)
    expect((await request(app).get('/api/teacher/session')).status).toBe(404)
  })

  it('refuses to start with a password shorter than 8 characters', () => {
    expect(() => makeApp({ teacherPassword: 'short' })).toThrow(/8자 이상/)
  })
})

describe('POST /api/teacher/login', () => {
  it('rejects a wrong password', async () => {
    const res = await login('wrong-password')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('WRONG_PASSWORD')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('rejects a missing password', async () => {
    const res = await request(app).post('/api/teacher/login').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_REQUEST')
  })

  it('sets an httpOnly, SameSite=Strict session cookie scoped to /api/teacher', async () => {
    const res = await login()
    expect(res.status).toBe(204)
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(cookie).toMatch(/^teacher_session=[A-Za-z0-9_-]{43};/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).toMatch(/Path=\/api\/teacher/)
    expect(cookie).toMatch(/Max-Age=1800/)
    expect(cookie).not.toMatch(/Secure/)
  })

  it('adds Secure when secureCookies is on', async () => {
    app = makeApp({ teacherPassword: PASSWORD, secureCookies: true })
    const cookie = ((await login()).headers['set-cookie'] as unknown as string[])[0]
    expect(cookie).toMatch(/Secure/)
  })

  it('stores only a hash of the session token', async () => {
    const token = (await loggedInCookie()).split('=')[1]
    const rows = db.prepare('SELECT token_hash FROM teacher_sessions').all() as { token_hash: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].token_hash).not.toContain(token)
  })
})

describe('login attempt limit', () => {
  it(`refuses logins for a while after ${LOGIN_MAX_FAILURES} wrong passwords`, async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) expect((await login('wrong-password')).status).toBe(401)

    const blocked = await login()
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toBe('TOO_MANY_ATTEMPTS')
    expect(blocked.headers['retry-after']).toBe(String(LOGIN_WINDOW_MS / 1000))

    clock += LOGIN_WINDOW_MS - 1000
    expect((await login()).headers['retry-after']).toBe('1')

    clock += 1000
    expect((await login()).status).toBe(204)
  })

  it('counts only failures within the window', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await login('wrong-password')
    clock += LOGIN_WINDOW_MS
    await login('wrong-password')
    expect((await login()).status).toBe(204)
  })

  it('clears the failures after a successful login', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await login('wrong-password')
    expect((await login()).status).toBe(204)
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) expect((await login('wrong-password')).status).toBe(401)
  })
})

describe('session', () => {
  it('needs a session', async () => {
    const res = await request(app).get('/api/teacher/session')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('rejects an unknown token', async () => {
    const res = await request(app).get('/api/teacher/session').set('Cookie', `${SESSION_COOKIE}=not-a-real-token`)
    expect(res.status).toBe(401)
  })

  it('reports when the session ends', async () => {
    const cookie = await loggedInCookie()
    const res = await request(app).get('/api/teacher/session').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ expiresAt: clock + SESSION_IDLE_MS })
  })

  it(`ends after ${SESSION_IDLE_MS / 60000} minutes without a request`, async () => {
    const cookie = await loggedInCookie()
    clock += SESSION_IDLE_MS
    expect((await request(app).get('/api/teacher/session').set('Cookie', cookie)).status).toBe(401)
  })

  it('is extended by each request', async () => {
    const cookie = await loggedInCookie()
    clock += SESSION_IDLE_MS - 1000
    const res = await request(app).get('/api/teacher/session').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.expiresAt).toBe(clock + SESSION_IDLE_MS)
    clock += SESSION_IDLE_MS - 1000
    expect((await request(app).get('/api/teacher/session').set('Cookie', cookie)).status).toBe(200)
  })

  it('ends on logout', async () => {
    const cookie = await loggedInCookie()
    const res = await request(app).post('/api/teacher/logout').set('Cookie', cookie)
    expect(res.status).toBe(204)
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^teacher_session=;/)
    expect((await request(app).get('/api/teacher/session').set('Cookie', cookie)).status).toBe(401)
  })

  it('deleteExpiredSessions removes only expired sessions', async () => {
    await loggedInCookie()
    clock += 60 * 1000
    await loggedInCookie()
    expect(deleteExpiredSessions(db, clock - 60 * 1000 + SESSION_IDLE_MS)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM teacher_sessions').get()).toEqual({ n: 1 })
  })
})

describe('student API is unchanged', () => {
  it('still serves the leaderboard without a session', async () => {
    expect((await request(app).get('/api/leaderboard')).status).toBe(200)
  })
})
