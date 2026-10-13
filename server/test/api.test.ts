import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateGameResponse, FinishResponse, LeaderboardResponse } from '../../shared/types.ts'
import { createApp } from '../src/app.ts'
import { openDb, type Db } from '../src/db.ts'
import { seededRandom } from '../src/game/shuffle.ts'
import { loadQuestionFile } from '../src/game/validateQuestions.ts'
import { deleteExpiredGames, GAME_TTL_MS } from '../src/gameStore.ts'
import { loadBannedWords } from '../src/nicknameFilter.ts'
import { deleteScore } from '../src/scoreQueries.ts'

const questions = loadQuestionFile(new URL('../data/questions.json', import.meta.url))
const bannedWords = loadBannedWords(new URL('../data/banned-words.txt', import.meta.url))
const answerOf = new Map(questions.map((q) => [q.id, q.choices[q.answerIndex]]))

let db: Db
let clock: number
let app: ReturnType<typeof createApp>

beforeEach(() => {
  db = openDb(':memory:')
  clock = Date.UTC(2026, 9, 14, 12, 0, 0)
  app = createApp({ db, questions, bannedWords, random: seededRandom(1), now: () => clock })
})

async function startGame(nickname = '테스터') {
  const res = await request(app).post('/api/games').send({ nickname }).expect(201)
  return res.body as CreateGameResponse
}

/** The shuffled index of the correct choice, found by matching the choice text. */
function correctIndex(game: CreateGameResponse, i: number) {
  const q = game.questions[i]
  return q.choices.indexOf(answerOf.get(q.id)!)
}

/**
 * Answers all 40 questions; `correctCount` of them correctly (the first ones), `secondsEach` apart.
 * Returns the finish response body.
 */
async function playGame(nickname: string, correctCount: number, secondsEach: number) {
  const game = await startGame(nickname)
  for (let i = 0; i < 40; i++) {
    clock += secondsEach * 1000
    const right = correctIndex(game, i)
    const choiceIndex = i < correctCount ? right : (right + 1) % 4
    await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: game.questions[i].id, choiceIndex }).expect(200)
  }
  const res = await request(app).post(`/api/games/${game.gameId}/finish`).expect(200)
  return { game, finish: res.body as FinishResponse }
}

describe('POST /api/games', () => {
  it('returns 40 questions in category order with no answers or explanations', async () => {
    const res = await request(app).post('/api/games').send({ nickname: '테스터' }).expect(201)
    const body = res.body as CreateGameResponse
    expect(body.gameId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.nickname).toBe('테스터')
    expect(body.questions).toHaveLength(40)
    expect(body.questions.map((q) => q.category)).toEqual(
      ['history', 'science', 'geography', 'arts'].flatMap((c) => Array(10).fill(c)),
    )
    for (const q of body.questions) expect(Object.keys(q).sort()).toEqual(['category', 'choices', 'id', 'question'])

    const raw = res.text
    expect(raw).not.toMatch(/answerIndex|explanation|difficulty/)
    for (const q of questions) expect(raw).not.toContain(q.explanation)
  })

  it('trims the nickname', async () => {
    const res = await request(app).post('/api/games').send({ nickname: '  홍길동 ' }).expect(201)
    expect(res.body.nickname).toBe('홍길동')
  })

  it.each([
    ['too short', '가'],
    ['too long', '가나다라마바사아자차카'],
    ['symbols', 'abc!'],
    ['missing', undefined],
    ['not a string', 12345],
  ])('rejects a nickname that breaks the rule (%s)', async (_, nickname) => {
    const res = await request(app).post('/api/games').send({ nickname }).expect(400)
    expect(res.body.error).toBe('INVALID_NICKNAME')
    expect(res.body.message).toBeTruthy()
  })

  it.each(['시발놈', 'Fuck123', '개새끼야', '시1발', '운영자', 'ADMIN'])('rejects a nickname with a banned word (%s)', async (nickname) => {
    const res = await request(app).post('/api/games').send({ nickname }).expect(400)
    expect(res.body).toEqual({ error: 'INVALID_NICKNAME', message: expect.stringContaining('사용할 수 없는') })
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/games').set('Content-Type', 'application/json').send('{bad').expect(400)
    expect(res.body.error).toBe('INVALID_REQUEST')
  })
})

describe('POST /api/games/:id/answers', () => {
  it('judges the answer and reveals the correct choice and explanation only after answering', async () => {
    const game = await startGame()
    const q = game.questions[0]
    const right = correctIndex(game, 0)
    const res = await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: q.id, choiceIndex: right }).expect(200)
    const original = questions.find((x) => x.id === q.id)!
    expect(res.body).toEqual({ correct: true, answerIndex: right, explanation: original.explanation, score: 10 })

    const wrong = await request(app)
      .post(`/api/games/${game.gameId}/answers`)
      .send({ questionId: game.questions[1].id, choiceIndex: (correctIndex(game, 1) + 1) % 4 })
      .expect(200)
    expect(wrong.body).toMatchObject({ correct: false, answerIndex: correctIndex(game, 1), score: 10 })
  })

  it('rejects a different answer to an already answered question with 409', async () => {
    const game = await startGame()
    const q = game.questions[0]
    await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: q.id, choiceIndex: 0 }).expect(200)
    const res = await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: q.id, choiceIndex: 1 }).expect(409)
    expect(res.body.error).toBe('ALREADY_ANSWERED')
  })

  it('returns the original result when the same answer is retried (lost response)', async () => {
    const game = await startGame()
    const send = () => request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: game.questions[0].id, choiceIndex: 2 })
    const first = await send().expect(200)
    await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: game.questions[1].id, choiceIndex: 0 }).expect(200)
    const retry = await send().expect(200)
    expect(retry.body).toEqual(first.body)
  })

  it('rejects answering out of order with 409', async () => {
    const game = await startGame()
    const res = await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: game.questions[1].id, choiceIndex: 0 }).expect(409)
    expect(res.body.error).toBe('OUT_OF_ORDER')
  })

  it('rejects a question that is not in the game with 409', async () => {
    const game = await startGame()
    await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: 'hist-99', choiceIndex: 0 }).expect(409)
  })

  it.each([
    [{ questionId: 'hist-01', choiceIndex: 4 }],
    [{ questionId: 'hist-01', choiceIndex: -1 }],
    [{ questionId: 'hist-01', choiceIndex: '1' }],
    [{ choiceIndex: 0 }],
  ])('rejects an invalid body with 400: %j', async (body) => {
    const game = await startGame()
    await request(app).post(`/api/games/${game.gameId}/answers`).send(body).expect(400)
  })

  it('returns 404 for an unknown game', async () => {
    const res = await request(app).post('/api/games/nope/answers').send({ questionId: 'hist-01', choiceIndex: 0 }).expect(404)
    expect(res.body.error).toBe('GAME_NOT_FOUND')
  })
})

describe('POST /api/games/:id/finish', () => {
  it('saves a complete game and returns the result and rank', async () => {
    const { finish } = await playGame('완주', 25, 3)
    expect(finish.rank).toBe(1)
    expect(finish.result).toMatchObject({ nickname: '완주', score: 250, correctCount: 25, total: 40 })
    // 40 answers × 3s = 120s, minus 4 × 1s of category intros.
    expect(finish.result.durationSec).toBe(116)
    expect(finish.result.records).toHaveLength(40)

    const board = (await request(app).get('/api/leaderboard').expect(200)).body as LeaderboardResponse
    expect(board.entries).toEqual([
      { id: finish.scoreId, rank: 1, nickname: '완주', score: 250, durationSec: 116, playedAt: new Date(clock).toISOString() },
    ])
  })

  it('refuses to save a game with fewer than 40 answers', async () => {
    const game = await startGame()
    for (let i = 0; i < 39; i++) {
      await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: game.questions[i].id, choiceIndex: 0 }).expect(200)
    }
    const res = await request(app).post(`/api/games/${game.gameId}/finish`).expect(409)
    expect(res.body.error).toBe('GAME_NOT_COMPLETE')
    expect(res.body.message).toContain('39/40')
    expect((await request(app).get('/api/leaderboard')).body.entries).toEqual([])
  })

  it('ignores a score, time or result sent by the client', async () => {
    const game = await startGame('정직')
    for (let i = 0; i < 40; i++) {
      clock += 2000
      await request(app)
        .post(`/api/games/${game.gameId}/answers`)
        .send({ questionId: game.questions[i].id, choiceIndex: (correctIndex(game, i) + 1) % 4, score: 400, correct: true })
        .expect(200)
    }
    const res = await request(app)
      .post(`/api/games/${game.gameId}/finish`)
      .send({ score: 400, durationSec: 1, correctCount: 40, result: { score: 400 } })
      .expect(200)
    expect(res.body.result).toMatchObject({ score: 0, correctCount: 0, durationSec: 76 })
    expect((await request(app).get('/api/leaderboard')).body.entries[0]).toMatchObject({ score: 0, durationSec: 76 })
  })

  it('saves only once when finish is retried, and returns the same result', async () => {
    const { game, finish } = await playGame('재시도', 10, 1)
    const again = await request(app).post(`/api/games/${game.gameId}/finish`).expect(200)
    expect(again.body).toEqual(finish)
    expect((await request(app).get('/api/leaderboard')).body.entries).toHaveLength(1)
  })

  it('rejects answers after the game is complete', async () => {
    const { game } = await playGame('끝남', 0, 1)
    const last = game.questions[39].id
    await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: 'hist-99', choiceIndex: 3 }).expect(409)
    // Re-sending a different answer to the last question is still refused.
    const res = await request(app).post(`/api/games/${game.gameId}/answers`).send({ questionId: last, choiceIndex: (correctIndex(game, 39) + 2) % 4 })
    expect(res.status).toBe(409)
  })

  it('returns 404 for an unknown game', async () => {
    await request(app).post('/api/games/nope/finish').expect(404)
  })
})

describe('GET /api/leaderboard', () => {
  it('sorts by score, then by faster time; equal score and time share a rank', async () => {
    const slow = await playGame('느림', 30, 5)
    const fast = await playGame('빠름', 30, 2)
    const best = await playGame('최고', 35, 9)
    const tieA = await playGame('동점가', 20, 3)
    const tieB = await playGame('동점나', 20, 3)

    const board = (await request(app).get('/api/leaderboard').expect(200)).body as LeaderboardResponse
    expect(board.entries.map((e) => [e.rank, e.nickname, e.score])).toEqual([
      [1, '최고', 350],
      [2, '빠름', 300],
      [3, '느림', 300],
      [4, '동점가', 200],
      [4, '동점나', 200],
    ])
    // The rank in a finish response is the rank at the moment it was saved.
    expect(slow.finish.rank).toBe(1)
    expect(fast.finish.rank).toBe(1)
    expect(best.finish.rank).toBe(1)
    expect(tieA.finish.rank).toBe(4)
    expect(tieB.finish.rank).toBe(4)
  })

  it('limits to 10 by default and reports my rank even outside the top 10', async () => {
    for (let i = 0; i < 11; i++) await playGame(`선수${i}`, 30, 1)
    const { finish } = await playGame('꼴찌', 5, 1)
    expect(finish.rank).toBe(12)
    const board = (await request(app).get('/api/leaderboard').expect(200)).body as LeaderboardResponse
    expect(board.entries).toHaveLength(10)
    expect(board.entries.some((e) => e.id === finish.scoreId)).toBe(false)
    expect((await request(app).get('/api/leaderboard?limit=20')).body.entries).toHaveLength(12)
    expect((await request(app).get('/api/leaderboard?limit=0')).body.entries).toHaveLength(1)
    expect((await request(app).get('/api/leaderboard?limit=abc')).body.entries).toHaveLength(10)
  })

  it('keeps every record of the same nickname', async () => {
    await playGame('같은이름', 10, 1)
    await playGame('같은이름', 20, 1)
    const board = (await request(app).get('/api/leaderboard')).body as LeaderboardResponse
    expect(board.entries.filter((e) => e.nickname === '같은이름')).toHaveLength(2)
  })

  it('drops a deleted record', async () => {
    const { finish } = await playGame('삭제대상', 10, 1)
    expect(deleteScore(db, finish.scoreId)).toBe(true)
    expect(deleteScore(db, finish.scoreId)).toBe(false)
    expect((await request(app).get('/api/leaderboard')).body.entries).toEqual([])
  })
})

describe('abandoned games', () => {
  it('are never on the leaderboard and are deleted after 24 hours', async () => {
    const abandoned = await startGame('중단')
    await request(app).post(`/api/games/${abandoned.gameId}/answers`).send({ questionId: abandoned.questions[0].id, choiceIndex: 0 }).expect(200)
    expect((await request(app).get('/api/leaderboard')).body.entries).toEqual([])

    expect(deleteExpiredGames(db, clock + GAME_TTL_MS - 1)).toBe(0)
    expect(deleteExpiredGames(db, clock + GAME_TTL_MS + 1)).toBe(1)
    await request(app).post(`/api/games/${abandoned.gameId}/answers`).send({ questionId: abandoned.questions[1].id, choiceIndex: 0 }).expect(404)
  })

  it('cleanup keeps the saved score of a finished game', async () => {
    await playGame('저장됨', 10, 1)
    deleteExpiredGames(db, clock + GAME_TTL_MS + 1)
    expect((await request(app).get('/api/leaderboard')).body.entries).toHaveLength(1)
  })
})

describe('unknown API paths', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404)
    expect(res.body.error).toBe('NOT_FOUND')
  })
})
