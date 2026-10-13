// Fails the build if question data leaked into the client bundle (dist/).
// The client must get questions from the server and learn answers only after answering.
// Field names such as "answerIndex" may appear (the client reads them from API responses);
// what must not appear is the question bank itself: question text, explanations, difficulty.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url)
const questions = JSON.parse(readFileSync(new URL('../server/data/questions.json', import.meta.url), 'utf8'))

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const texts = files(dist.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  .filter((path) => /\.(js|css|html|json|map)$/.test(path))
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }))

const leaks = []
for (const q of questions) {
  for (const [kind, value] of [
    ['question', q.question],
    ['explanation', q.explanation],
  ]) {
    for (const { path, text } of texts) {
      if (text.includes(value)) leaks.push(`${q.id} ${kind} in ${path}`)
    }
  }
}
for (const { path, text } of texts) {
  if (/"difficulty"\s*:/.test(text)) leaks.push(`question bank field "difficulty" in ${path}`)
}

if (leaks.length > 0) {
  console.error(`Question data found in the client bundle:\n${leaks.slice(0, 20).join('\n')}`)
  process.exit(1)
}
console.log(`Bundle check: none of the ${questions.length} questions or explanations are in dist/ (${texts.length} files)`)
