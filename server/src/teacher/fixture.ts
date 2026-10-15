// Test data for teacher mode: a class roster and plays with known results (see report.test.ts for the expected values).
// Used by npm run teacher-fixture and the teacher report tests.
import { randomUUID } from 'node:crypto'
import { CATEGORIES } from '../../../shared/types.ts'
import type { Db } from '../db.ts'
import type { Question } from '../game/types.ts'
import { importRoster } from '../roster.ts'

export const FIXTURE_ROSTER = {
  className: '3학년 2반',
  students: [
    { number: 1, name: '김민수', nicknames: ['민수', 'kms01'] },
    { number: 2, name: '이서연', nicknames: ['서연'] },
    { number: 3, name: '박지훈', nicknames: ['지훈'] },
    { number: 4, name: '최유나', nicknames: ['유나'] },
    { number: 5, name: '정도윤', nicknames: ['도윤'] }, // never played
    { number: 6, name: '강하은', nicknames: ['하은'] },
    { number: 7, name: '윤서준', nicknames: ['서준'] },
    { number: 8, name: '한지민', nicknames: ['지민'] },
  ],
}

// A student with k correct answers in a category gets the first k questions of this order right.
// The easy questions geo-01 and hist-01 come last, so most students miss them.
export const MISSED_LAST = ['geo-01', 'hist-01']

const HOUR = 60 * 60 * 1000
// [nickname, hours ago, correct per category (history, science, geography, arts), duration in seconds]
export const FIXTURE_PLAYS: [string, number, number[], number][] = [
  ['민수', 8 * 24, [6, 5, 5, 6], 610],
  ['kms01', 3 * 24, [7, 7, 7, 7], 540], // 민수's second nickname
  ['민수', 2, [9, 8, 8, 9], 480], // improving: 220 → 280 → 340
  ['서연', 5 * 24, [9, 9, 9, 9], 420],
  ['서연', 3, [10, 9, 10, 9], 400],
  ['지훈', 4, [6, 6, 2, 4], 700], // weak in geography
  ['유나', 10 * 24, [8, 7, 8, 7], 500],
  ['유나', 4 * 24, [6, 6, 5, 6], 520],
  ['유나', 1, [5, 5, 4, 5], 560], // declining: 300 → 230 → 190
  ['하은', 5, [7, 6, 6, 7], 530],
  ['서준', 6 * 24, [3, 3, 3, 3], 800],
  ['서준', 6, [4, 4, 3, 4], 760], // lowest
  ['지민', 2 * 24, [10, 10, 10, 10], 380], // perfect score
  ['손님1', 7, [5, 5, 5, 5], 600], // not on the roster
  ['지훈2', 8, [5, 4, 3, 4], 650], // not on the roster, looks like 지훈
]

/** Fills an empty database with the fixture roster, plays relative to `now`, and one abandoned game. */
export function buildTeacherFixture(db: Db, bank: Question[], now: number) {
  const order = Object.fromEntries(
    CATEGORIES.map((category) => {
      const ids = bank.filter((q) => q.category === category).map((q) => q.id)
      return [category, [...ids.filter((id) => !MISSED_LAST.includes(id)), ...ids.filter((id) => MISSED_LAST.includes(id))]]
    }),
  )
  const insertScore = db.prepare(
    'INSERT INTO scores (nickname, score, correct_by_category, duration_sec, played_at) VALUES (?, ?, ?, ?, ?)',
  )
  const insertGame = db.prepare(
    'INSERT INTO games (id, nickname, plan, answers, started_at, score_id, finished) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  db.transaction(() => {
    for (const [nickname, hoursAgo, counts, durationSec] of FIXTURE_PLAYS) {
      const playedAt = now - hoursAgo * HOUR
      const byCategory = Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]]))
      const score = counts.reduce((a, b) => a + b, 0) * 10
      const scoreId = Number(
        insertScore.run(nickname, score, JSON.stringify(byCategory), durationSec, new Date(playedAt).toISOString())
          .lastInsertRowid,
      )
      // Per-question answers only exist for games started in the last 24 hours, as on the real server.
      if (hoursAgo < 24) {
        const startedAt = playedAt - durationSec * 1000
        const answers = CATEGORIES.flatMap((c, i) =>
          order[c].map((questionId, j) => ({ questionId, choiceIndex: 0, correct: j < counts[i], answeredAt: startedAt })),
        )
        const plan = answers.map((a) => ({ questionId: a.questionId, choiceOrder: [0, 1, 2, 3] }))
        insertGame.run(randomUUID(), nickname, JSON.stringify(plan), JSON.stringify(answers), startedAt, scoreId, 1)
      }
    }
    insertGame.run(randomUUID(), '하은', '[]', '[]', now - HOUR, null, 0) // abandoned game
    importRoster(db, FIXTURE_ROSTER)
  })()
}
