// Deletes one leaderboard record. Usage: npm run delete-score -- <id>
// Record ids are the "id" field in GET /api/leaderboard?limit=100.
import { config } from '../config.ts'
import { openDb } from '../db.ts'
import { deleteScore, getScore } from '../scoreQueries.ts'

const arg = process.argv[2]
const id = Number(arg)
if (!arg || !Number.isInteger(id) || id <= 0) {
  console.error('사용법: npm run delete-score -- <기록 id>')
  process.exit(1)
}

const db = openDb(config.dbPath)
const score = getScore(db, id)
if (!score) {
  console.error(`id ${id} 기록이 없습니다. (DB: ${config.dbPath})`)
  db.close()
  process.exit(1)
}
deleteScore(db, id)
db.close()
console.log(`삭제했습니다: #${score.id} ${score.nickname} ${score.score}점 ${score.durationSec}초 (${score.playedAt})`)
