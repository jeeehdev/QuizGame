// Runs the real Express app with an in-memory database and routes the client's fetch calls to it.
import { resolve } from 'node:path'
import request from 'supertest'
import { vi } from 'vitest'
import { createApp } from '../../server/src/app.ts'
import { openDb, type Db } from '../../server/src/db.ts'
import { seededRandom } from '../../server/src/game/shuffle.ts'
import { loadQuestionFile } from '../../server/src/game/validateQuestions.ts'
import { loadBannedWords } from '../../server/src/nicknameFilter.ts'

// Paths from the project root: under jsdom, import.meta.url is not a file: URL.
export const serverQuestions = loadQuestionFile(resolve(process.cwd(), 'server/data/questions.json'))
const bannedWords = loadBannedWords(resolve(process.cwd(), 'server/data/banned-words.txt'))

export interface TestServer {
  db: Db
  app: ReturnType<typeof createApp>
  /** Paths requested, e.g. "POST /api/games". */
  calls: string[]
  /** Makes the next matching request ("METHOD path") fail before reaching the server, as if offline. */
  failNext: (pattern: RegExp) => void
  /** Lets the next matching request reach the server, then loses the response. */
  loseResponseNext: (pattern: RegExp) => void
}

export function installTestServer(): TestServer {
  const db = openDb(':memory:')
  const app = createApp({ db, questions: serverQuestions, bannedWords, random: seededRandom(1) })
  const calls: string[] = []
  const failures: RegExp[] = []
  const lostResponses: RegExp[] = []
  const take = (list: RegExp[], call: string) => {
    const i = list.findIndex((pattern) => pattern.test(call))
    if (i >= 0) list.splice(i, 1)
    return i >= 0
  }

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const call = `${method} ${url}`
    calls.push(call)
    if (take(failures, call)) throw new TypeError('Failed to fetch')
    const agent = request(app)
    const req = method === 'POST' ? agent.post(url) : agent.get(url)
    const res = init?.body ? await req.set('Content-Type', 'application/json').send(JSON.parse(String(init.body))) : await req
    if (take(lostResponses, call)) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } })
  })

  return {
    db,
    app,
    calls,
    failNext: (pattern) => failures.push(pattern),
    loseResponseNext: (pattern) => lostResponses.push(pattern),
  }
}

/** The shuffled index of the correct choice for a question shown to the client. */
export function correctChoiceIndex(question: { id: string; choices: string[] }): number {
  const original = serverQuestions.find((q) => q.id === question.id)!
  return question.choices.indexOf(original.choices[original.answerIndex])
}
