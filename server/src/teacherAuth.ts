// Teacher login with one shared password (TEACHER_PASSWORD).
// A session is a random token in an httpOnly cookie; the database keeps only its SHA-256 hash.
// Sessions end after SESSION_IDLE_MS without a teacher request. Repeated wrong passwords from one IP are refused for a while.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import type { TeacherSessionResponse } from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import type { Db } from './db.ts'

export const SESSION_IDLE_MS = 30 * 60 * 1000
export const LOGIN_WINDOW_MS = 2 * 60 * 1000
export const LOGIN_MAX_FAILURES = 5
export const MIN_PASSWORD_LENGTH = 8
export const SESSION_COOKIE = 'teacher_session'
const COOKIE_PATH = '/api/teacher'

/** Throws when a teacher password is set but too short to be safe. */
export function assertTeacherPassword(password: string): void {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    throw new Error(`TEACHER_PASSWORD는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
  }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest()
const tokenHash = (token: string) => sha256(token).toString('hex')

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Deletes sessions that have expired. Returns how many were deleted. */
export function deleteExpiredSessions(db: Db, now: number = Date.now()): number {
  return db.prepare('DELETE FROM teacher_sessions WHERE expires_at <= ?').run(now).changes
}

export interface TeacherAuthOptions {
  db: Db
  password: string
  now: () => number
  /** Adds the Secure flag to the cookie (production, behind HTTPS). */
  secureCookies: boolean
}

/**
 * Router for /api/teacher. Login and logout are public; every route added after `requireTeacher`
 * (the session check, plus the teacher features in later stages) needs a valid session.
 */
export function createTeacherRouter({ db, password, now, secureCookies }: TeacherAuthOptions) {
  assertTeacherPassword(password)
  const passwordHash = sha256(password)
  /** Wrong-password times per client IP within the last LOGIN_WINDOW_MS. */
  const failures = new Map<string, number[]>()
  const router = Router()

  const setSessionCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      path: COOKIE_PATH,
      maxAge: SESSION_IDLE_MS,
    })

  function recentFailures(ip: string, at: number): number[] {
    for (const [key, times] of failures) {
      const kept = times.filter((t) => at - t < LOGIN_WINDOW_MS)
      if (kept.length === 0) failures.delete(key)
      else failures.set(key, kept)
    }
    return failures.get(ip) ?? []
  }

  router.post('/login', (req, res) => {
    const at = now()
    const ip = req.ip ?? ''
    const recent = recentFailures(ip, at)
    if (recent.length >= LOGIN_MAX_FAILURES) {
      const retryAfterSec = Math.ceil((recent[0] + LOGIN_WINDOW_MS - at) / 1000)
      res.set('Retry-After', String(retryAfterSec))
      return sendError(res, 429, 'TOO_MANY_ATTEMPTS', `비밀번호를 여러 번 틀렸습니다. ${retryAfterSec}초 뒤에 다시 시도해 주세요.`)
    }

    const given = req.body?.password
    if (typeof given !== 'string' || given === '') {
      return sendError(res, 400, 'INVALID_REQUEST', '비밀번호를 입력해 주세요.')
    }
    if (!timingSafeEqual(sha256(given), passwordHash)) {
      failures.set(ip, [...recent, at])
      return sendError(res, 401, 'WRONG_PASSWORD', '비밀번호가 맞지 않습니다.')
    }

    failures.delete(ip)
    const token = randomBytes(32).toString('base64url')
    db.prepare('INSERT INTO teacher_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(
      tokenHash(token),
      at,
      at + SESSION_IDLE_MS,
    )
    setSessionCookie(res, token)
    res.status(204).end()
  })

  router.post('/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE)
    if (token) db.prepare('DELETE FROM teacher_sessions WHERE token_hash = ?').run(tokenHash(token))
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: COOKIE_PATH })
    res.status(204).end()
  })

  /** Lets the request through only with a live session, and extends that session by SESSION_IDLE_MS. */
  const requireTeacher: RequestHandler = (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE)
    const at = now()
    const expiresAt = at + SESSION_IDLE_MS
    const updated = token
      ? db
          .prepare('UPDATE teacher_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?')
          .run(expiresAt, tokenHash(token), at).changes
      : 0
    if (!token || updated === 0) {
      return sendError(res, 401, 'UNAUTHORIZED', '선생님 로그인이 필요합니다.')
    }
    setSessionCookie(res, token)
    res.locals.teacherExpiresAt = expiresAt
    next()
  }
  router.use(requireTeacher)

  router.get('/session', (_req, res) => {
    res.json({ expiresAt: res.locals.teacherExpiresAt as number } satisfies TeacherSessionResponse)
  })

  return router
}
