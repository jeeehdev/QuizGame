import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RosterResponse, RosterStudent, UnmatchedNicknamesResponse } from '../../shared/types.ts'
import { createApp } from '../src/app.ts'
import { openDb, type Db } from '../src/db.ts'
import { loadQuestionFile } from '../src/game/validateQuestions.ts'
import {
  addStudent,
  getClassName,
  getRoster,
  importRoster,
  linkNickname,
  listStudents,
  removeStudent,
  RosterError,
  setClassName,
  unlinkNickname,
  unmatchedNicknames,
  updateStudent,
} from '../src/roster.ts'
import { SESSION_COOKIE } from '../src/teacherAuth.ts'

const questions = loadQuestionFile(new URL('../data/questions.json', import.meta.url))
const PASSWORD = 'correct-horse'

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
})

function addScore(nickname: string, score: number, playedAt: string) {
  const perCategory = score / 40
  db.prepare(
    'INSERT INTO scores (nickname, score, correct_by_category, duration_sec, played_at) VALUES (?, ?, ?, 300, ?)',
  ).run(nickname, score, JSON.stringify({ history: perCategory, science: perCategory, geography: perCategory, arts: perCategory }), playedAt)
}

/** The RosterError a roster call throws. */
function rosterError(fn: () => unknown): RosterError {
  try {
    fn()
  } catch (error) {
    if (error instanceof RosterError) return error
    throw error
  }
  throw new Error('expected a RosterError')
}

const fileRoster = {
  className: '3학년 2반',
  students: [
    { number: 2, name: '이서연', nicknames: ['일반창'] },
    { number: 1, name: '김민수', nicknames: ['브라우저1'] },
    { number: 3, name: '박지훈', nicknames: ['시크릿창', '다다'] },
  ],
}

describe('roster functions', () => {
  it('adds students in number order with their nicknames and play counts', () => {
    addScore('다다', 120, '2026-10-14T01:00:00.000Z')
    addScore('시크릿창', 100, '2026-10-14T02:00:00.000Z')
    addStudent(db, { number: 3, name: ' 박지훈 ', nicknames: ['시크릿창', '다다'] })
    addStudent(db, { number: 1, name: '김민수' })
    expect(listStudents(db)).toEqual([
      { id: 2, number: 1, name: '김민수', nicknames: [], playCount: 0 },
      { id: 1, number: 3, name: '박지훈', nicknames: ['시크릿창', '다다'], playCount: 2 },
    ])
  })

  it.each([
    ['number 0', { number: 0, name: '가' }, 'INVALID_REQUEST', /출석 번호/],
    ['a decimal number', { number: 1.5, name: '가' }, 'INVALID_REQUEST', /출석 번호/],
    ['an empty name', { number: 1, name: '  ' }, 'INVALID_REQUEST', /이름/],
    ['a long name', { number: 1, name: '가'.repeat(21) }, 'INVALID_REQUEST', /이름/],
    ['a short nickname', { number: 1, name: '가', nicknames: ['a'] }, 'INVALID_REQUEST', /2~10자/],
    ['a nickname with symbols', { number: 1, name: '가', nicknames: ['닉!'] }, 'INVALID_REQUEST', /한글, 영문, 숫자/],
    ['the same nickname twice', { number: 1, name: '가', nicknames: ['닉네임', '닉네임'] }, 'INVALID_REQUEST', /두 번/],
  ])('rejects %s', (_case, input, code, message) => {
    const error = rosterError(() => addStudent(db, input))
    expect(error.code).toBe(code)
    expect(error.message).toMatch(message)
    expect(listStudents(db)).toEqual([])
  })

  it('rejects a taken number or nickname with 409 and adds nothing', () => {
    addStudent(db, { number: 1, name: '김민수', nicknames: ['민수'] })
    const number = rosterError(() => addStudent(db, { number: 1, name: '이서연' }))
    expect([number.code, number.status]).toEqual(['DUPLICATE_NUMBER', 409])
    const nickname = rosterError(() => addStudent(db, { number: 2, name: '이서연', nicknames: ['서연', '민수'] }))
    expect([nickname.code, nickname.status]).toEqual(['NICKNAME_TAKEN', 409])
    expect(nickname.message).toMatch(/1번 김민수/)
    expect(listStudents(db)).toHaveLength(1)
    expect(rosterError(() => linkNickname(db, 1, '민수')).code).toBe('NICKNAME_TAKEN')
  })

  it('updates number and name, keeping numbers unique', () => {
    const a = addStudent(db, { number: 1, name: '김민수' })
    addStudent(db, { number: 2, name: '이서연' })
    expect(updateStudent(db, a.id, { number: 5 }).number).toBe(5)
    expect(updateStudent(db, a.id, { name: '김민준' }).name).toBe('김민준')
    expect(rosterError(() => updateStudent(db, a.id, { number: 2 })).code).toBe('DUPLICATE_NUMBER')
    expect(rosterError(() => updateStudent(db, 99, { name: '누구' })).code).toBe('STUDENT_NOT_FOUND')
  })

  it('links and unlinks nicknames', () => {
    const a = addStudent(db, { number: 1, name: '김민수' })
    expect(linkNickname(db, a.id, ' kms01 ').nicknames).toEqual(['kms01'])
    expect(unlinkNickname(db, 'kms01').nicknames).toEqual([])
    expect(rosterError(() => unlinkNickname(db, 'kms01')).code).toBe('NICKNAME_NOT_FOUND')
    expect(rosterError(() => linkNickname(db, 99, '닉네임')).code).toBe('STUDENT_NOT_FOUND')
  })

  it('removing a student drops their nicknames but keeps their scores', () => {
    addScore('민수', 200, '2026-10-14T01:00:00.000Z')
    const a = addStudent(db, { number: 1, name: '김민수', nicknames: ['민수'] })
    expect(removeStudent(db, a.id).name).toBe('김민수')
    expect(db.prepare('SELECT COUNT(*) AS n FROM student_nicknames').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM scores').get()).toEqual({ n: 1 })
    expect(unmatchedNicknames(db).map((n) => n.nickname)).toEqual(['민수'])
  })

  it('finds similar students by given name when they have no nicknames yet', () => {
    addStudent(db, { number: 3, name: '박지훈' })
    addStudent(db, { number: 4, name: '최유나' })
    addScore('지훈2', 160, '2026-10-14T02:00:00.000Z')
    addScore('나나', 100, '2026-10-14T02:00:00.000Z')
    expect(unmatchedNicknames(db).map((n) => [n.nickname, n.similarStudentIds])).toEqual([
      ['나나', []],
      ['지훈2', [1]],
    ])
  })

  it('lists unmatched nicknames with similar students as a hint only', () => {
    addStudent(db, { number: 3, name: '박지훈', nicknames: ['지훈'] })
    addScore('지훈', 100, '2026-10-14T01:00:00.000Z')
    addScore('지훈2', 160, '2026-10-14T02:00:00.000Z')
    addScore('지훈2', 120, '2026-10-14T03:00:00.000Z')
    addScore('손님1', 200, '2026-10-14T00:30:00.000Z')
    expect(unmatchedNicknames(db)).toEqual([
      {
        nickname: '지훈2',
        playCount: 2,
        bestScore: 160,
        firstPlayedAt: '2026-10-14T02:00:00.000Z',
        lastPlayedAt: '2026-10-14T03:00:00.000Z',
        similarStudentIds: [1],
      },
      {
        nickname: '손님1',
        playCount: 1,
        bestScore: 200,
        firstPlayedAt: '2026-10-14T00:30:00.000Z',
        lastPlayedAt: '2026-10-14T00:30:00.000Z',
        similarStudentIds: [],
      },
    ])
    expect(listStudents(db)[0].nicknames).toEqual(['지훈'])
  })

  it('stores the class name', () => {
    expect(getClassName(db)).toBe('')
    setClassName(db, ' 3학년 2반 ')
    expect(getClassName(db)).toBe('3학년 2반')
    expect(rosterError(() => setClassName(db, '')).code).toBe('INVALID_REQUEST')
  })
})

describe('importRoster', () => {
  it('imports the teacher/roster.json format', () => {
    expect(importRoster(db, fileRoster)).toEqual({ className: '3학년 2반', studentCount: 3, nicknameCount: 4 })
    expect(getRoster(db)).toEqual({
      className: '3학년 2반',
      students: [
        expect.objectContaining({ number: 1, name: '김민수', nicknames: ['브라우저1'] }),
        expect.objectContaining({ number: 2, name: '이서연', nicknames: ['일반창'] }),
        expect.objectContaining({ number: 3, name: '박지훈', nicknames: ['시크릿창', '다다'] }),
      ],
    })
  })

  it('imports nothing when any student is invalid, and lists every problem', () => {
    const broken = {
      className: '3학년 2반',
      students: [
        { number: 1, name: '김민수', nicknames: ['민수'] },
        { number: 1, name: '', nicknames: ['민수', 'x'] },
      ],
    }
    const error = rosterError(() => importRoster(db, broken))
    expect(error.message).toMatch(/아무것도 가져오지 않았습니다/)
    expect(error.message).toMatch(/2번째 학생: 이름/)
    expect(error.message).toMatch(/출석 번호 1: 두 학생/)
    expect(error.message).toMatch(/"민수": 두 학생/)
    expect(error.message).toMatch(/"x"/)
    expect(listStudents(db)).toEqual([])
    expect(getClassName(db)).toBe('')
  })

  it('refuses to overwrite a roster unless replace is set', () => {
    addStudent(db, { number: 9, name: '기존 학생' })
    expect(rosterError(() => importRoster(db, fileRoster)).message).toMatch(/이미 학생 1명/)
    importRoster(db, fileRoster, { replace: true })
    expect(listStudents(db).map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('rejects a file that is not a roster', () => {
    expect(rosterError(() => importRoster(db, [1, 2])).message).toMatch(/형식/)
  })

  it('keeps the roster after the database is reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quiz-roster-'))
    const path = join(dir, 'quiz.sqlite')
    try {
      const first = openDb(path)
      importRoster(first, fileRoster)
      first.close()
      const second = openDb(path)
      expect(getRoster(second).students).toHaveLength(3)
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('roster API', () => {
  let app: ReturnType<typeof createApp>
  let cookie: string

  beforeEach(async () => {
    app = createApp({ db, questions, bannedWords: [], teacherPassword: PASSWORD })
    const res = await request(app).post('/api/teacher/login').send({ password: PASSWORD }).expect(204)
    cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(SESSION_COOKIE))!.split(';')[0]
  })

  const api = () => ({
    get: (path: string) => request(app).get(path).set('Cookie', cookie),
    post: (path: string, body: object) => request(app).post(path).set('Cookie', cookie).send(body),
    patch: (path: string, body: object) => request(app).patch(path).set('Cookie', cookie).send(body),
    delete: (path: string) => request(app).delete(path).set('Cookie', cookie),
  })

  it('needs a teacher session', async () => {
    for (const res of [
      await request(app).get('/api/teacher/roster'),
      await request(app).post('/api/teacher/students').send({ number: 1, name: '가' }),
      await request(app).get('/api/teacher/nicknames/unmatched'),
    ]) {
      expect(res.status).toBe(401)
    }
    expect(listStudents(db)).toEqual([])
  })

  it('manages the roster', async () => {
    addScore('민수', 200, '2026-10-14T01:00:00.000Z')
    addScore('kms01', 240, '2026-10-14T02:00:00.000Z')
    expect((await api().patch('/api/teacher/roster', { className: '3학년 2반' })).body.className).toBe('3학년 2반')

    const added = await api().post('/api/teacher/students', { number: 1, name: '김민수', nicknames: ['민수'] })
    expect(added.status).toBe(201)
    const student = added.body as RosterStudent
    expect(student).toMatchObject({ number: 1, name: '김민수', nicknames: ['민수'], playCount: 1 })

    expect((await api().get('/api/teacher/nicknames/unmatched')).body as UnmatchedNicknamesResponse).toEqual({
      nicknames: [expect.objectContaining({ nickname: 'kms01', playCount: 1, bestScore: 240 })],
    })
    const linked = await api().post(`/api/teacher/students/${student.id}/nicknames`, { nickname: 'kms01' })
    expect(linked.status).toBe(201)
    expect(linked.body.playCount).toBe(2)

    expect((await api().patch(`/api/teacher/students/${student.id}`, { name: '김민준' })).body.name).toBe('김민준')
    expect((await api().delete('/api/teacher/nicknames/kms01')).body.nicknames).toEqual(['민수'])

    const roster = (await api().get('/api/teacher/roster')).body as RosterResponse
    expect(roster).toEqual({
      className: '3학년 2반',
      students: [{ id: student.id, number: 1, name: '김민준', nicknames: ['민수'], playCount: 1 }],
    })

    expect((await api().delete(`/api/teacher/students/${student.id}`)).status).toBe(200)
    expect(((await api().get('/api/teacher/roster')).body as RosterResponse).students).toEqual([])
  })

  it('answers rule violations with the matching status and code', async () => {
    await api().post('/api/teacher/students', { number: 1, name: '김민수', nicknames: ['민수'] }).expect(201)
    const cases: [Promise<request.Response>, number, string][] = [
      [api().post('/api/teacher/students', { number: 'x', name: '가' }), 400, 'INVALID_REQUEST'],
      [api().post('/api/teacher/students', { number: 1, name: '이서연' }), 409, 'DUPLICATE_NUMBER'],
      [api().post('/api/teacher/students', { number: 2, name: '이서연', nicknames: ['민수'] }), 409, 'NICKNAME_TAKEN'],
      [api().patch('/api/teacher/students/999', { name: '누구' }), 404, 'STUDENT_NOT_FOUND'],
      [api().delete('/api/teacher/students/abc'), 404, 'STUDENT_NOT_FOUND'],
      [api().delete('/api/teacher/nicknames/없는닉네임'), 404, 'NICKNAME_NOT_FOUND'],
      [api().patch('/api/teacher/roster', { className: '' }), 400, 'INVALID_REQUEST'],
    ]
    for (const [pending, status, error] of cases) {
      const res = await pending
      expect([res.status, res.body.error], res.body.message).toEqual([status, error])
    }
  })
})
