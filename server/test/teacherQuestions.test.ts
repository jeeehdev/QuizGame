import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CreateGameResponse, FinishResponse, SwapResponse, TeacherQuestionsResponse } from '../../shared/types.ts'
import { createApp } from '../src/app.ts'
import { openDb, type Db } from '../src/db.ts'
import { seededRandom } from '../src/game/shuffle.ts'
import type { Question } from '../src/game/types.ts'
import { loadQuestionFile } from '../src/game/validateQuestions.ts'
import { formatQuestionFile, loadCandidateFile } from '../src/questionBank.ts'
import { SESSION_COOKIE } from '../src/teacherAuth.ts'

const PASSWORD = 'correct-horse'
const sourceBank = new URL('../data/questions.json', import.meta.url)
const original = loadQuestionFile(sourceBank)
/** A geography easy candidate whose choices and answer differ from geo-01, so grading shows which one was used. */
const candidate: Question = {
  id: 'geo-11',
  category: 'geography',
  difficulty: 'easy',
  question: '테스트용 후보 문제입니다. 정답은?',
  choices: ['가', '나', '다', '라'],
  answerIndex: 2,
  explanation: '테스트용 해설입니다.',
}

let dir: string
let bankPath: string
let candidatesPath: string
let db: Db
let clock: number
let app: ReturnType<typeof createApp>
let cookie: string

/** Builds the app the way index.ts does: both files read from disk, the same database. */
function startServer() {
  const questions = loadQuestionFile(bankPath)
  app = createApp({
    db,
    questions,
    candidates: loadCandidateFile(candidatesPath, questions),
    bannedWords: [],
    random: seededRandom(7),
    now: () => clock,
    teacherPassword: PASSWORD,
    questionFiles: { bankPath, candidatesPath },
  })
}

async function login() {
  const res = await request(app).post('/api/teacher/login').send({ password: PASSWORD }).expect(204)
  cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(SESSION_COOKIE))!.split(';')[0]
}

const swap = (bankId: string, candidateId: string) =>
  request(app).post('/api/teacher/swap').set('Cookie', cookie).send({ bankId, candidateId })

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'quiz-teacher-'))
  bankPath = join(dir, 'questions.json')
  candidatesPath = join(dir, 'question-candidates.json')
  copyFileSync(sourceBank, bankPath)
  writeFileSync(candidatesPath, formatQuestionFile([candidate]))
  db = openDb(':memory:')
  clock = Date.UTC(2026, 9, 14, 12, 0, 0)
  startServer()
  await login()
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

/** Answer text by question id for every question the test knows, in play or not. */
const answerText = new Map([...original, candidate].map((q) => [q.id, q.choices[q.answerIndex]]))

async function startGame() {
  return (await request(app).post('/api/games').send({ nickname: '테스터' }).expect(201)).body as CreateGameResponse
}

/** Answers questions [from, to) correctly. */
async function answerCorrectly(game: CreateGameResponse, from: number, to: number) {
  for (let i = from; i < to; i++) {
    clock += 3000
    const q = game.questions[i]
    const choiceIndex = q.choices.indexOf(answerText.get(q.id)!)
    const res = await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: q.id, choiceIndex })
    expect(res.status, `${q.id}: ${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body.correct, q.id).toBe(true)
  }
}

describe('access', () => {
  it('needs a teacher session', async () => {
    expect((await request(app).get('/api/teacher/questions')).status).toBe(401)
    expect((await request(app).post('/api/teacher/swap').send({ bankId: 'geo-01', candidateId: 'geo-11' })).status).toBe(401)
    expect(readFileSync(bankPath, 'utf8')).toBe(readFileSync(sourceBank, 'utf8'))
  })

  it('is not available without question files', async () => {
    app = createApp({ db, questions: original, bannedWords: [], now: () => clock, teacherPassword: PASSWORD })
    await login()
    expect((await request(app).get('/api/teacher/questions').set('Cookie', cookie)).status).toBe(404)
  })
})

describe('GET /api/teacher/questions', () => {
  it('lists questions in play and candidates with answers and explanations', async () => {
    const res = await request(app).get('/api/teacher/questions').set('Cookie', cookie).expect(200)
    const body = res.body as TeacherQuestionsResponse
    expect(body.bank).toHaveLength(40)
    expect(body.bank[0]).toEqual(original[0])
    expect(body.candidates).toEqual([candidate])
  })

  it('shows candidates added to the file while the server runs', async () => {
    const extra = { ...candidate, id: 'geo-12', question: '나중에 추가한 후보 문제는?' }
    writeFileSync(candidatesPath, formatQuestionFile([candidate, extra]))
    const res = await request(app).get('/api/teacher/questions').set('Cookie', cookie).expect(200)
    expect((res.body as TeacherQuestionsResponse).candidates.map((q) => q.id)).toEqual(['geo-11', 'geo-12'])
  })
})

describe('POST /api/teacher/swap', () => {
  it('swaps in the files and returns both lists', async () => {
    const res = await swap('geo-01', 'geo-11')
    expect(res.status).toBe(200)
    const body = res.body as SwapResponse
    expect(body.added).toEqual(candidate)
    expect(body.removed.id).toBe('geo-01')
    expect(body.bank.map((q) => q.id)).toContain('geo-11')
    expect(body.bank.map((q) => q.id)).not.toContain('geo-01')
    expect(body.candidates.map((q) => q.id)).toEqual(['geo-01'])

    const bankIds = loadQuestionFile(bankPath).map((q) => q.id)
    expect(bankIds).toContain('geo-11')
    expect(bankIds).not.toContain('geo-01')
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('puts the new question in new games without a restart', async () => {
    await swap('geo-01', 'geo-11').expect(200)
    const ids = (await startGame()).questions.map((q) => q.id)
    expect(ids).toContain('geo-11')
    expect(ids).not.toContain('geo-01')
  })

  it('keeps student game responses free of answers', async () => {
    await swap('geo-01', 'geo-11').expect(200)
    const game = await startGame()
    for (const q of game.questions) expect(Object.keys(q).sort()).toEqual(['category', 'choices', 'id', 'question'])
  })

  it('lets a game started before the swap finish with its original questions', async () => {
    const game = await startGame()
    await answerCorrectly(game, 0, 5)
    await swap('geo-01', 'geo-11').expect(200)
    await answerCorrectly(game, 5, 40)
    const finish = (await request(app).post(`/api/games/${game.gameId}/finish`).expect(200)).body as FinishResponse
    expect(finish.result.score).toBe(400)
  })

  it('lets that game continue after a restart too', async () => {
    const game = await startGame()
    await answerCorrectly(game, 0, 5)
    await swap('geo-01', 'geo-11').expect(200)
    startServer()
    await answerCorrectly(game, 5, 40)
    expect((await request(app).post(`/api/games/${game.gameId}/finish`)).status).toBe(200)
  })

  it('swapping back restores the original file exactly', async () => {
    await swap('geo-01', 'geo-11').expect(200)
    await swap('geo-11', 'geo-01').expect(200)
    expect(readFileSync(bankPath, 'utf8')).toBe(readFileSync(sourceBank, 'utf8'))
    expect(readFileSync(candidatesPath, 'utf8')).toBe(formatQuestionFile([candidate]))
  })

  it.each([
    ['a different difficulty', 'hist-09', 'geo-11', /카테고리와 난이도가 같은 문제끼리만/],
    ['an unknown question', 'geo-99', 'geo-11', /geo-99/],
    ['an unknown candidate', 'geo-01', 'geo-99', /geo-99/],
  ])('rejects %s without touching the files', async (_case, bankId, candidateId, message) => {
    const res = await swap(bankId, candidateId)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('SWAP_REJECTED')
    expect(res.body.message).toMatch(message)
    expect(readFileSync(bankPath, 'utf8')).toBe(readFileSync(sourceBank, 'utf8'))
    expect(readFileSync(candidatesPath, 'utf8')).toBe(formatQuestionFile([candidate]))
  })

  it('rejects a request without ids', async () => {
    const res = await request(app).post('/api/teacher/swap').set('Cookie', cookie).send({ bankId: 'geo-01' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_REQUEST')
  })
})
