import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import type {
  AnswerResponse,
  CreateGameResponse,
  FinishResponse,
  LeaderboardResponse,
} from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import type { Db } from './db.ts'
import {
  answerQuestion,
  createGame,
  currentQuestion,
  getResult,
  getScore,
  isComplete,
  toPublicQuestion,
} from './game/game.ts'
import type { RandomFn } from './game/shuffle.ts'
import type { Question, StoredAnswer } from './game/types.ts'
import { insertGame, loadGame, markFinished, saveAnswers } from './gameStore.ts'
import { checkNickname } from './nicknameFilter.ts'
import { getLeaderboard, getRank, insertScore } from './scoreQueries.ts'
import { createTeacherRouter } from './teacherAuth.ts'
import { createTeacherQuestionsRouter, type QuestionFiles } from './teacherQuestions.ts'

export const LEADERBOARD_DEFAULT_LIMIT = 10
export const LEADERBOARD_MAX_LIMIT = 100

export interface AppOptions {
  db: Db
  /** Questions in play; new games draw from these. */
  questions: Question[]
  /** Candidate pool. Games started before a swap may still use a question that is now a candidate. */
  candidates?: Question[]
  bannedWords: string[]
  /** Injected for tests; defaults to Math.random / Date.now. */
  random?: RandomFn
  now?: () => number
  /** Built client to serve next to the API (production). Omit to serve the API only. */
  clientDir?: string
  /** Shared teacher password. Without it every /api/teacher route answers 404. */
  teacherPassword?: string
  /** Adds the Secure flag to the teacher session cookie (production, behind HTTPS). */
  secureCookies?: boolean
  /** Express "trust proxy" setting, so login limits see real client IPs behind a reverse proxy. */
  trustProxy?: boolean | number | string
  /** Data files the teacher swap API writes. Without them the swap API is not available. */
  questionFiles?: QuestionFiles
}

export function createApp({
  db,
  questions,
  candidates = [],
  bannedWords,
  random = Math.random,
  now = Date.now,
  clientDir,
  teacherPassword,
  secureCookies = false,
  trustProxy,
  questionFiles,
}: AppOptions) {
  // New games draw from `playable`. Stored games are rebuilt from `known` (in play + candidates), so a game
  // started before a swap keeps its original questions until it ends, even after a restart.
  let playable = questions
  let known = new Map([...candidates, ...questions].map((q) => [q.id, q]))
  const app = express()
  app.disable('x-powered-by')
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy)
  app.use('/api', express.json({ limit: '4kb' }))

  // Starts a game. The response has the 40 questions in play order but no answers or explanations.
  app.post('/api/games', (req, res) => {
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : ''
    const problem = checkNickname(nickname, bannedWords)
    if (problem) return sendError(res, 400, 'INVALID_NICKNAME', problem)

    const id = randomUUID()
    const state = createGame(playable, nickname, { random, now: now() })
    insertGame(db, id, state)
    res.status(201).json({
      gameId: id,
      nickname,
      questions: state.questions.map(toPublicQuestion),
    } satisfies CreateGameResponse)
  })

  // Answers the next question. Only in play order, once per question; an identical retry returns the same result.
  app.post('/api/games/:id/answers', (req, res) => {
    const { questionId, choiceIndex } = req.body ?? {}
    if (typeof questionId !== 'string' || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
      return sendError(res, 400, 'INVALID_REQUEST', 'questionId와 choiceIndex(0~3)가 필요합니다.')
    }

    // Load, check and save in one transaction so concurrent requests cannot both answer the same question.
    const outcome = db.transaction(() => {
      const game = loadGame(db, known, req.params.id)
      if (!game) return { status: 404, error: 'GAME_NOT_FOUND', message: '게임을 찾을 수 없습니다.' } as const

      const index = game.state.questions.findIndex((q) => q.id === questionId)
      const previous = index >= 0 ? game.state.answers[index] : undefined
      if (previous) {
        if (previous.choiceIndex !== choiceIndex) {
          return { status: 409, error: 'ALREADY_ANSWERED', message: '이미 답한 문제입니다. 답은 바꿀 수 없습니다.' } as const
        }
        // Same answer sent again (e.g. the first response was lost): repeat the original result.
        return { body: answerBody(game.state.questions[index], previous.correct, game.state.answers.slice(0, index + 1)) }
      }

      const expected = currentQuestion(game.state)
      if (game.finished || !expected || expected.id !== questionId) {
        return { status: 409, error: 'OUT_OF_ORDER', message: '지금 답할 수 있는 문제가 아닙니다.' } as const
      }

      const next = answerQuestion(game.state, choiceIndex, now())
      saveAnswers(db, game.id, next.answers)
      const answer = next.answers.at(-1)!
      return { body: answerBody(expected, answer.correct, next.answers) }
    })()

    if ('body' in outcome) return res.json(outcome.body)
    sendError(res, outcome.status, outcome.error, outcome.message)
  })

  // Saves a fully answered game and returns the result with its rank. A repeated call returns the same result.
  // Score and time come only from the server's records; anything the client sends in the body is ignored.
  app.post('/api/games/:id/finish', (req, res) => {
    const outcome = db.transaction(() => {
      const game = loadGame(db, known, req.params.id)
      if (!game) return { status: 404, error: 'GAME_NOT_FOUND', message: '게임을 찾을 수 없습니다.' } as const
      if (!isComplete(game.state)) {
        return {
          status: 409,
          error: 'GAME_NOT_COMPLETE',
          message: `40문제를 모두 풀어야 저장할 수 있습니다. (${game.state.answers.length}/${game.state.questions.length})`,
        } as const
      }
      const result = getResult(game.state)
      let scoreId = game.scoreId
      if (!game.finished) {
        scoreId = insertScore(db, result, new Date(now()))
        markFinished(db, game.id, scoreId)
      }
      const rank = scoreId === null ? null : getRank(db, scoreId)
      if (scoreId === null || rank === null) {
        return { status: 404, error: 'NOT_FOUND', message: '저장된 기록이 삭제되었습니다.' } as const
      }
      return { body: { scoreId, rank, result } satisfies FinishResponse }
    })()

    if ('body' in outcome) return res.json(outcome.body)
    sendError(res, outcome.status, outcome.error, outcome.message)
  })

  app.get('/api/leaderboard', (req, res) => {
    const requested = Number(req.query.limit ?? LEADERBOARD_DEFAULT_LIMIT)
    const limit = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), LEADERBOARD_MAX_LIMIT)
      : LEADERBOARD_DEFAULT_LIMIT
    res.json({ entries: getLeaderboard(db, limit) } satisfies LeaderboardResponse)
  })

  if (teacherPassword !== undefined) {
    const teacher = createTeacherRouter({ db, password: teacherPassword, now, secureCookies })
    if (questionFiles) {
      teacher.use(
        createTeacherQuestionsRouter({
          files: questionFiles,
          onSwap: (result) => {
            playable = result.bank
            known = new Map([...result.candidates, ...result.bank].map((q) => [q.id, q]))
          },
        }),
      )
    }
    app.use('/api/teacher', teacher)
  }

  app.use('/api', (_req, res) => sendError(res, 404, 'NOT_FOUND', '없는 API입니다.'))

  if (clientDir && existsSync(clientDir)) {
    const root = resolve(clientDir)
    app.use(express.static(root))
    // Single-page app: any other GET returns index.html.
    app.get(/.*/, (_req, res) => res.sendFile(resolve(root, 'index.html')))
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Malformed JSON bodies arrive here from express.json().
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return sendError(res, 400, 'INVALID_REQUEST', '요청 형식이 올바르지 않습니다.')
    }
    console.error(err)
    sendError(res, 500, 'INTERNAL', '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
  }
  app.use(onError)

  return app
}

function answerBody(
  question: Question,
  correct: boolean,
  answersSoFar: StoredAnswer[],
): AnswerResponse {
  return {
    correct,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    score: getScore({ answers: answersSoFar }),
  }
}
