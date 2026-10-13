import { buildQuestions } from './game/game.ts'
import type { GameState, PlannedQuestion, Question, StoredAnswer } from './game/types.ts'
import type { Db } from './db.ts'

export const GAME_TTL_MS = 24 * 60 * 60 * 1000

export interface StoredGame {
  id: string
  state: GameState
  finished: boolean
  scoreId: number | null
}

interface GameRow {
  id: string
  nickname: string
  plan: string
  answers: string
  started_at: number
  score_id: number | null
  finished: number
}

export function insertGame(db: Db, id: string, state: GameState): void {
  db.prepare('INSERT INTO games (id, nickname, plan, answers, started_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    state.nickname,
    JSON.stringify(state.plan),
    JSON.stringify(state.answers),
    state.startedAt,
  )
}

export function loadGame(db: Db, bank: ReadonlyMap<string, Question>, id: string): StoredGame | null {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
  if (!row) return null
  const plan = JSON.parse(row.plan) as PlannedQuestion[]
  return {
    id: row.id,
    state: {
      nickname: row.nickname,
      plan,
      questions: buildQuestions(bank, plan),
      answers: JSON.parse(row.answers) as StoredAnswer[],
      startedAt: row.started_at,
    },
    finished: row.finished === 1,
    scoreId: row.score_id,
  }
}

export function saveAnswers(db: Db, id: string, answers: StoredAnswer[]): void {
  db.prepare('UPDATE games SET answers = ? WHERE id = ?').run(JSON.stringify(answers), id)
}

export function markFinished(db: Db, id: string, scoreId: number): void {
  db.prepare('UPDATE games SET finished = 1, score_id = ? WHERE id = ?').run(scoreId, id)
}

/** Deletes games started more than 24 hours ago. Unfinished ones were abandoned and never get a score. */
export function deleteExpiredGames(db: Db, now: number = Date.now()): number {
  return db.prepare('DELETE FROM games WHERE started_at < ?').run(now - GAME_TTL_MS).changes
}
