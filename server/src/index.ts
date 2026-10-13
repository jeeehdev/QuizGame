import { createApp } from './app.ts'
import { config } from './config.ts'
import { openDb } from './db.ts'
import { loadQuestionFile } from './game/validateQuestions.ts'
import { deleteExpiredGames } from './gameStore.ts'
import { loadBannedWords } from './nicknameFilter.ts'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const apiOnly = process.argv.includes('--api-only')

const db = openDb(config.dbPath)
const app = createApp({
  db,
  questions: loadQuestionFile(config.questionsPath),
  bannedWords: loadBannedWords(config.bannedWordsPath),
  clientDir: apiOnly ? undefined : config.clientDir,
})

function cleanup() {
  const deleted = deleteExpiredGames(db)
  if (deleted > 0) console.log(`Deleted ${deleted} game(s) older than 24 hours`)
}
cleanup()
setInterval(cleanup, CLEANUP_INTERVAL_MS).unref()

const server = app.listen(config.port, () => {
  console.log(`Quiz server on http://localhost:${config.port}${apiOnly ? ' (API only)' : ''} — DB ${config.dbPath}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
