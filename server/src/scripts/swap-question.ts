// Swaps a question in the bank with a candidate of the same category and difficulty.
// Usage: npm run swap-question -- <출제 문제 id> <후보 문제 id>
import { config } from '../config.ts'
import { swapQuestionFiles } from '../questionBank.ts'

const [bankId, candidateId] = process.argv.slice(2)
if (!bankId || !candidateId) {
  console.error('사용법: npm run swap-question -- <출제 문제 id> <후보 문제 id>')
  process.exit(1)
}

try {
  const { removed, added } = swapQuestionFiles(config.questionsPath, config.candidatesPath, bankId, candidateId)
  console.log(`출제 문제로 넣음: ${added.id} ${added.question}`)
  console.log(`후보로 옮김: ${removed.id} ${removed.question}`)
  console.log('검수표를 다시 만들려면 npm run review-doc, 실행 중인 서버는 재시작해야 반영됩니다.')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
