// Builds a test database for teacher mode (the /teacher-* commands, npm run teacher-report, the web screens).
// Usage: npm run teacher-fixture -- <새 DB 경로>
// Then run the commands or the server with DB_PATH=<that path>.
import { readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from '../config.ts'
import { openDb } from '../db.ts'
import type { Question } from '../game/types.ts'
import { buildTeacherFixture, FIXTURE_PLAYS, FIXTURE_ROSTER } from '../teacher/fixture.ts'

const target = process.argv[2]
if (!target) {
  console.error('사용법: npm run teacher-fixture -- <새 DB 경로>')
  process.exit(1)
}
if (resolve(target) === resolve(config.dbPath)) {
  console.error(`실제 DB(${config.dbPath})에는 만들 수 없습니다. 다른 경로를 지정하세요.`)
  process.exit(1)
}
for (const suffix of ['', '-wal', '-shm']) rmSync(target + suffix, { force: true })

const bank = JSON.parse(readFileSync(config.questionsPath, 'utf8')) as Question[]
const db = openDb(target)
buildTeacherFixture(db, bank, Date.now())
db.close()

console.log(`테스트 DB를 만들었습니다: ${target} (기록 ${FIXTURE_PLAYS.length}건, 중간에 나간 게임 1건)`)
console.log(`명단: ${FIXTURE_ROSTER.className} 학생 ${FIXTURE_ROSTER.students.length}명 (DB에 들어 있습니다)`)
console.log(`사용: DB_PATH=${target} npm run teacher-report -- 7d`)
