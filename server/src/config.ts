import { fileURLToPath } from 'node:url'

const fromServer = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** Settings from environment variables, with defaults for local development. */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? fromServer('data/quiz.sqlite'),
  questionsPath: fromServer('data/questions.json'),
  bannedWordsPath: process.env.BANNED_WORDS_PATH ?? fromServer('data/banned-words.txt'),
  /** Built client (vite build output). Served unless the server is started with --api-only. */
  clientDir: fileURLToPath(new URL('../../dist', import.meta.url)),
}
