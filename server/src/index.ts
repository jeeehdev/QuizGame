import { createApp } from './app.ts'
import { config } from './config.ts'
import { openDb } from './db.ts'
import { loadQuestionFile } from './game/validateQuestions.ts'
import { deleteExpiredGames } from './gameStore.ts'
import { loadBannedWords } from './nicknameFilter.ts'
import { loadCandidateFile } from './questionBank.ts'
import { deleteExpiredSessions } from './teacherAuth.ts'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const apiOnly = process.argv.includes('--api-only')

const db = openDb(config.dbPath)
const questions = loadQuestionFile(config.questionsPath)
const app = createApp({
  db,
  questions,
  candidates: loadCandidateFile(config.candidatesPath, questions),
  bannedWords: loadBannedWords(config.bannedWordsPath),
  clientDir: apiOnly ? undefined : config.clientDir,
  teacherPassword: config.teacherPassword,
  secureCookies: config.secureCookies,
  trustProxy: config.trustProxy,
  questionFiles: { bankPath: config.questionsPath, candidatesPath: config.candidatesPath },
})

function cleanup() {
  const deleted = deleteExpiredGames(db)
  if (deleted > 0) console.log(`Deleted ${deleted} game(s) older than 24 hours`)
  deleteExpiredSessions(db)
}
cleanup()
setInterval(cleanup, CLEANUP_INTERVAL_MS).unref()

const server = app.listen(config.port, () => {
  console.log(`Quiz server on http://localhost:${config.port}${apiOnly ? ' (API only)' : ''} — DB ${config.dbPath}`)
  console.log(config.teacherPassword ? 'Teacher mode: on' : 'Teacher mode: off (set TEACHER_PASSWORD to enable)')
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
