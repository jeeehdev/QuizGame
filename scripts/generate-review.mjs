// Regenerates docs/questions-review.md from server/data/questions.json and question-candidates.json.
// Usage: npm run review-doc
import { readFileSync, writeFileSync } from 'node:fs'

const questions = JSON.parse(readFileSync(new URL('../server/data/questions.json', import.meta.url), 'utf8'))
const candidates = JSON.parse(readFileSync(new URL('../server/data/question-candidates.json', import.meta.url), 'utf8'))

const CATEGORIES = [
  ['history', '한국사'],
  ['science', '과학'],
  ['geography', '지리'],
  ['arts', '예술과 문화'],
]
const DIFFICULTY = { easy: '쉬움', medium: '보통', hard: '어려움' }
const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')

const lines = [
  '# 문제 검수표',
  '',
  '> 이 파일은 `npm run review-doc`으로 `server/data/questions.json`(출제 문제)과 `question-candidates.json`(후보 문제)에서 생성됩니다. 문제를 고칠 때는 JSON을 수정한 뒤 다시 생성하세요.',
  '',
  '검수 방법: 각 문제의 정답과 해설을 백과사전 등 출처로 확인하고, 문제가 없으면 마지막 칸에 ✅, 고칠 점이 있으면 메모를 남깁니다.',
  '',
  '검수 기준은 [퀴즈 문제 교차 검증 가이드라인](question-guidelines.md)을 따릅니다.',
  '',
  '- 정답이 하나뿐인가 (다른 해석이 가능하면 조건을 명시했는가)',
  "- '가장 큰', '최초의' 같은 최상급 표현에 측정 기준이 있는가",
  '- 시점과 지리적·분류적 범위가 명확한가',
  '- 의심스러운 정보는 2개 이상의 출처로 확인했는가 (논란이 있으면 주류 학설 기준)',
  '- 오답 보기가 그럴듯하지만 정답과 혼동되지 않는가',
  '',
  `총 ${questions.length}문제 · 후보 ${candidates.length}문제`,
  '',
]

function pushTable(items) {
  lines.push('| id | 난이도 | 문제 | 보기 (정답 굵게) | 해설 | 검수 |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const q of items) {
    const choices = q.choices
      .map((c, i) => `${i + 1}. ${i === q.answerIndex ? `**${cell(c)}**` : cell(c)}`)
      .join('<br>')
    lines.push(`| ${q.id} | ${DIFFICULTY[q.difficulty]} | ${cell(q.question)} | ${choices} | ${cell(q.explanation)} | |`)
  }
  lines.push('')
}

for (const [category, label] of CATEGORIES) {
  const items = questions.filter((q) => q.category === category)
  const mix = Object.keys(DIFFICULTY)
    .map((d) => `${DIFFICULTY[d]} ${items.filter((q) => q.difficulty === d).length}`)
    .join(' · ')
  lines.push(`## ${label} (${items.length}문제: ${mix})`, '')
  pushTable(items)
}

lines.push(
  '## 후보 문제',
  '',
  '출제되지 않는 문제입니다. `npm run swap-question -- <출제 문제 id> <후보 id>`로 카테고리와 난이도가 같은 출제 문제와 바꿉니다.',
  '',
)
if (candidates.length === 0) lines.push('후보 문제가 없습니다.', '')
for (const [category, label] of CATEGORIES) {
  const items = candidates.filter((q) => q.category === category)
  if (items.length === 0) continue
  lines.push(`### ${label} (${items.length}문제)`, '')
  pushTable(items)
}

writeFileSync(new URL('../docs/questions-review.md', import.meta.url), lines.join('\n'))
console.log(`docs/questions-review.md: ${questions.length} questions, ${candidates.length} candidates`)
