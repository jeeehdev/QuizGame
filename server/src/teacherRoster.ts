// Teacher API for the class roster. Mounted after requireTeacher (teacherAuth.ts), so every route needs a session.
import { Router, type Response } from 'express'
import type { RosterResponse, RosterStudent, UnmatchedNicknamesResponse } from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import type { Db } from './db.ts'
import {
  addStudent,
  getRoster,
  linkNickname,
  removeStudent,
  RosterError,
  setClassName,
  unlinkNickname,
  unmatchedNicknames,
  updateStudent,
} from './roster.ts'

/** Runs a roster change and sends its result, or the rule it broke. */
function respond<T>(res: Response, status: number, run: () => T) {
  let result: T
  try {
    result = run()
  } catch (error) {
    if (error instanceof RosterError) return sendError(res, error.status, error.code, error.message)
    throw error
  }
  res.status(status).json(result)
}

function studentId(value: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new RosterError('STUDENT_NOT_FOUND', '명단에 없는 학생입니다.')
  return id
}

export function createTeacherRosterRouter({ db }: { db: Db }) {
  const router = Router()

  router.get('/roster', (_req, res) => {
    res.json(getRoster(db) satisfies RosterResponse)
  })

  router.patch('/roster', (req, res) => respond(res, 200, (): RosterResponse => {
    setClassName(db, req.body?.className)
    return getRoster(db)
  }))

  router.post('/students', (req, res) => respond(res, 201, (): RosterStudent => addStudent(db, req.body ?? {})))

  router.patch('/students/:id', (req, res) =>
    respond(res, 200, (): RosterStudent => updateStudent(db, studentId(req.params.id), req.body ?? {})),
  )

  router.delete('/students/:id', (req, res) =>
    respond(res, 200, (): RosterStudent => removeStudent(db, studentId(req.params.id))),
  )

  router.post('/students/:id/nicknames', (req, res) =>
    respond(res, 201, (): RosterStudent => linkNickname(db, studentId(req.params.id), req.body?.nickname)),
  )

  router.delete('/nicknames/:nickname', (req, res) =>
    respond(res, 200, (): RosterStudent => unlinkNickname(db, req.params.nickname)),
  )

  router.get('/nicknames/unmatched', (_req, res) => {
    res.json({ nicknames: unmatchedNicknames(db) } satisfies UnmatchedNicknamesResponse)
  })

  return router
}
