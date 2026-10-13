// Class roster in the database: class name, students (출석 번호, name) and the nicknames each student plays under.
// Used by the teacher API (teacherRoster.ts) and the roster CLI (scripts/roster.ts), so both apply the same rules.
import type {
  AddStudentRequest,
  ApiErrorCode,
  RosterResponse,
  RosterStudent,
  UnmatchedNickname,
  UpdateStudentRequest,
} from '../../shared/types.ts'
import { validateNickname } from '../../shared/nickname.ts'
import type { Db } from './db.ts'

export const MAX_STUDENT_NUMBER = 999
export const MAX_NAME_LENGTH = 20
export const MAX_CLASS_NAME_LENGTH = 30

type RosterErrorCode = Extract<
  ApiErrorCode,
  'INVALID_REQUEST' | 'DUPLICATE_NUMBER' | 'NICKNAME_TAKEN' | 'STUDENT_NOT_FOUND' | 'NICKNAME_NOT_FOUND'
>
const STATUS: Record<RosterErrorCode, number> = {
  INVALID_REQUEST: 400,
  DUPLICATE_NUMBER: 409,
  NICKNAME_TAKEN: 409,
  STUDENT_NOT_FOUND: 404,
  NICKNAME_NOT_FOUND: 404,
}

/** A roster rule was broken. `status` is the HTTP status the teacher API answers with. */
export class RosterError extends Error {
  readonly code: RosterErrorCode
  readonly status: number

  constructor(code: RosterErrorCode, message: string) {
    super(message)
    this.name = 'RosterError'
    this.code = code
    this.status = STATUS[code]
  }
}

const invalid = (message: string) => new RosterError('INVALID_REQUEST', message)
const length = (text: string) => [...text].length

export function checkNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_STUDENT_NUMBER) {
    throw invalid(`출석 번호는 1~${MAX_STUDENT_NUMBER} 사이의 정수여야 합니다.`)
  }
  return value
}

export function checkName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (length(name) < 1 || length(name) > MAX_NAME_LENGTH) throw invalid(`이름은 1~${MAX_NAME_LENGTH}자로 입력해 주세요.`)
  return name
}

/** Same rules as the game (2~10자, 한글·영문·숫자), so only nicknames that can appear in scores are accepted. */
export function checkNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.trim() : ''
  const problem = validateNickname(nickname)
  if (problem) throw invalid(`닉네임 "${nickname}": ${problem}`)
  return nickname
}

function checkClassName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (length(name) < 1 || length(name) > MAX_CLASS_NAME_LENGTH) {
    throw invalid(`반 이름은 1~${MAX_CLASS_NAME_LENGTH}자로 입력해 주세요.`)
  }
  return name
}

interface StudentRow {
  id: number
  number: number
  name: string
}

function findStudent(db: Db, id: number): StudentRow {
  const row = db.prepare('SELECT id, number, name FROM students WHERE id = ?').get(id) as StudentRow | undefined
  if (!row) throw new RosterError('STUDENT_NOT_FOUND', '명단에 없는 학생입니다.')
  return row
}

function assertNumberFree(db: Db, number: number, exceptId?: number) {
  const row = db.prepare('SELECT id, name FROM students WHERE number = ?').get(number) as { id: number; name: string } | undefined
  if (row && row.id !== exceptId) throw new RosterError('DUPLICATE_NUMBER', `${number}번은 이미 ${row.name} 학생의 번호입니다.`)
}

function assertNicknameFree(db: Db, nickname: string) {
  const row = db
    .prepare('SELECT s.number, s.name FROM student_nicknames n JOIN students s ON s.id = n.student_id WHERE n.nickname = ?')
    .get(nickname) as { number: number; name: string } | undefined
  if (row) throw new RosterError('NICKNAME_TAKEN', `닉네임 "${nickname}": 이미 ${row.number}번 ${row.name} 학생에게 연결되어 있습니다.`)
}

export function getClassName(db: Db): string {
  const row = db.prepare("SELECT value FROM teacher_settings WHERE key = 'class_name'").get() as { value: string } | undefined
  return row?.value ?? ''
}

export function setClassName(db: Db, value: unknown): string {
  const name = checkClassName(value)
  db.prepare("INSERT INTO teacher_settings (key, value) VALUES ('class_name', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(name)
  return name
}

/** Finished games per nickname. */
function playCounts(db: Db): Map<string, number> {
  const rows = db.prepare('SELECT nickname, COUNT(*) AS n FROM scores GROUP BY nickname').all() as { nickname: string; n: number }[]
  return new Map(rows.map((r) => [r.nickname, r.n]))
}

export function listStudents(db: Db): RosterStudent[] {
  const students = db.prepare('SELECT id, number, name FROM students ORDER BY number').all() as StudentRow[]
  const links = db.prepare('SELECT nickname, student_id FROM student_nicknames ORDER BY rowid').all() as {
    nickname: string
    student_id: number
  }[]
  const plays = playCounts(db)
  return students.map((s) => {
    const nicknames = links.filter((l) => l.student_id === s.id).map((l) => l.nickname)
    return { ...s, nicknames, playCount: nicknames.reduce((sum, n) => sum + (plays.get(n) ?? 0), 0) }
  })
}

export function getRoster(db: Db): RosterResponse {
  return { className: getClassName(db), students: listStudents(db) }
}

const studentById = (db: Db, id: number) => listStudents(db).find((s) => s.id === id)!

export function addStudent(db: Db, request: Partial<AddStudentRequest>): RosterStudent {
  const number = checkNumber(request.number)
  const name = checkName(request.name)
  if (request.nicknames !== undefined && !Array.isArray(request.nicknames)) throw invalid('닉네임 목록 형식이 올바르지 않습니다.')
  const nicknames = (request.nicknames ?? []).map(checkNickname)
  if (new Set(nicknames).size !== nicknames.length) throw invalid('같은 닉네임을 두 번 넣었습니다.')

  const id = db.transaction(() => {
    assertNumberFree(db, number)
    for (const nickname of nicknames) assertNicknameFree(db, nickname)
    const newId = Number(db.prepare('INSERT INTO students (number, name) VALUES (?, ?)').run(number, name).lastInsertRowid)
    const link = db.prepare('INSERT INTO student_nicknames (nickname, student_id) VALUES (?, ?)')
    for (const nickname of nicknames) link.run(nickname, newId)
    return newId
  })()
  return studentById(db, id)
}

export function updateStudent(db: Db, id: number, request: Partial<UpdateStudentRequest>): RosterStudent {
  const current = findStudent(db, id)
  const number = request.number === undefined ? current.number : checkNumber(request.number)
  const name = request.name === undefined ? current.name : checkName(request.name)
  assertNumberFree(db, number, id)
  db.prepare('UPDATE students SET number = ?, name = ? WHERE id = ?').run(number, name, id)
  return studentById(db, id)
}

/** Removes a student and their nickname links. Their scores stay on the leaderboard. */
export function removeStudent(db: Db, id: number): RosterStudent {
  findStudent(db, id)
  const removed = studentById(db, id)
  db.prepare('DELETE FROM students WHERE id = ?').run(id)
  return removed
}

export function linkNickname(db: Db, id: number, value: unknown): RosterStudent {
  findStudent(db, id)
  const nickname = checkNickname(value)
  assertNicknameFree(db, nickname)
  db.prepare('INSERT INTO student_nicknames (nickname, student_id) VALUES (?, ?)').run(nickname, id)
  return studentById(db, id)
}

export function unlinkNickname(db: Db, value: unknown): RosterStudent {
  const nickname = typeof value === 'string' ? value.trim() : ''
  const row = db.prepare('SELECT student_id FROM student_nicknames WHERE nickname = ?').get(nickname) as
    | { student_id: number }
    | undefined
  if (!row) throw new RosterError('NICKNAME_NOT_FOUND', `닉네임 "${nickname}": 어느 학생에게도 연결되어 있지 않습니다.`)
  db.prepare('DELETE FROM student_nicknames WHERE nickname = ?').run(nickname)
  return studentById(db, row.student_id)
}

/**
 * Nicknames with saved scores that no student uses. A student is "similar" when the nickname contains, or is
 * contained in, the student's name, given name (a 3-character Korean name without the family name, 박지훈 → 지훈)
 * or one of their nicknames (지훈2 → 박지훈). Similar students are only a hint.
 */
export function unmatchedNicknames(db: Db): UnmatchedNickname[] {
  const rows = db
    .prepare(
      `SELECT nickname, COUNT(*) AS playCount, MAX(score) AS bestScore,
              MIN(played_at) AS firstPlayedAt, MAX(played_at) AS lastPlayedAt
       FROM scores
       WHERE nickname NOT IN (SELECT nickname FROM student_nicknames)
       GROUP BY nickname
       ORDER BY lastPlayedAt DESC, nickname`,
    )
    .all() as Omit<UnmatchedNickname, 'similarStudentIds'>[]
  const students = listStudents(db)
  const looksLike = (a: string, b: string) => length(b) >= 2 && (a.includes(b) || b.includes(a))
  const givenName = (name: string) => (/^[가-힣]{3}$/.test(name) ? name.slice(1) : '')
  return rows.map((row) => ({
    ...row,
    similarStudentIds: students
      .filter((s) => [s.name, givenName(s.name), ...s.nicknames].some((word) => looksLike(row.nickname, word)))
      .map((s) => s.id),
  }))
}

/** The teacher/roster.json format used before the roster moved to the database. */
interface RosterFile {
  className?: unknown
  students?: unknown
}

export interface ImportResult {
  className: string
  studentCount: number
  nicknameCount: number
}

/**
 * Imports a roster file (teacher/roster.json format). Every student is checked first; nothing is written unless the
 * whole file is valid. Refuses to overwrite an existing roster unless `replace` is set.
 */
export function importRoster(db: Db, data: unknown, { replace = false } = {}): ImportResult {
  const file = (typeof data === 'object' && data !== null ? data : {}) as RosterFile
  if (!Array.isArray(file.students)) throw invalid('명단 파일 형식이 올바르지 않습니다. { "className": …, "students": [ … ] } 형식이어야 합니다.')

  const errors: string[] = []
  const attempt = <T>(label: string, fn: () => T): T | undefined => {
    try {
      return fn()
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }
  const className = attempt('반 이름', () => checkClassName(file.className))
  const students = (file.students as unknown[]).map((raw, i) => {
    const s = (typeof raw === 'object' && raw !== null ? raw : {}) as { number?: unknown; name?: unknown; nicknames?: unknown }
    const label = `${i + 1}번째 학생`
    const number = attempt(label, () => checkNumber(s.number))
    const name = attempt(label, () => checkName(s.name))
    const nicknames = Array.isArray(s.nicknames)
      ? s.nicknames.map((n) => attempt(label, () => checkNickname(n))).filter((n): n is string => n !== undefined)
      : (errors.push(`${label}: nicknames는 배열이어야 합니다.`), [])
    return { number, name, nicknames }
  })
  const seenNumbers = new Set<number>()
  const seenNicknames = new Set<string>()
  for (const s of students) {
    if (s.number !== undefined) {
      if (seenNumbers.has(s.number)) errors.push(`출석 번호 ${s.number}: 두 학생이 같은 번호입니다.`)
      seenNumbers.add(s.number)
    }
    for (const n of s.nicknames) {
      if (seenNicknames.has(n)) errors.push(`닉네임 "${n}": 두 학생에게 연결되어 있습니다.`)
      seenNicknames.add(n)
    }
  }
  if (errors.length > 0) throw invalid(`명단 파일에 문제가 있어 아무것도 가져오지 않았습니다.\n${errors.join('\n')}`)

  const existing = (db.prepare('SELECT COUNT(*) AS n FROM students').get() as { n: number }).n
  if (existing > 0 && !replace) {
    throw invalid(`이미 학생 ${existing}명이 명단에 있습니다. 바꿔 쓰려면 --replace를 붙이세요.`)
  }
  db.transaction(() => {
    db.prepare('DELETE FROM students').run()
    setClassName(db, className)
    const insert = db.prepare('INSERT INTO students (number, name) VALUES (?, ?)')
    const link = db.prepare('INSERT INTO student_nicknames (nickname, student_id) VALUES (?, ?)')
    for (const s of students) {
      const id = Number(insert.run(s.number!, s.name!).lastInsertRowid)
      for (const n of s.nicknames) link.run(n, id)
    }
  })()
  return { className: className!, studentCount: students.length, nicknameCount: seenNicknames.size }
}
