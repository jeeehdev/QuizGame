import { fileURLToPath } from 'node:url'

const fromServer = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** Settings from environment variables, with defaults for local development. */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? fromServer('data/quiz.sqlite'),
  questionsPath: fromServer('data/questions.json'),
  /** Questions written but not in play; swapped into the bank with npm run swap-question. */
  candidatesPath: fromServer('data/question-candidates.json'),
  bannedWordsPath: process.env.BANNED_WORDS_PATH ?? fromServer('data/banned-words.txt'),
  /** Built client (vite build output). Served unless the server is started with --api-only. */
  clientDir: fileURLToPath(new URL('../../dist', import.meta.url)),
  /** Shared teacher password; teacher mode is off when unset or empty. */
  teacherPassword: process.env.TEACHER_PASSWORD || undefined,
  /** Secure cookies need HTTPS, so they are on only in production. */
  secureCookies: process.env.NODE_ENV === 'production',
  /** TRUST_PROXY: "true", a number of hops, or an Express trust proxy string. Unset means no proxy. */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
}

function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  if (value === undefined || value === '') return undefined
  if (value === 'true' || value === 'false') return value === 'true'
  return /^\d+$/.test(value) ? Number(value) : value
}
