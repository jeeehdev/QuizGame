// Regenerates docs/questions-review.md from server/data/questions.json.
// Usage: npm run review-doc
import { readFileSync, writeFileSync } from 'node:fs'

const questions = JSON.parse(readFileSync(new URL('../server/data/questions.json', import.meta.url), 'utf8'))

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
  '> 이 파일은 `npm run review-doc`으로 `server/data/questions.json`에서 생성됩니다. 문제를 고칠 때는 JSON을 수정한 뒤 다시 생성하세요.',
  '',
  '검수 방법: 각 문제의 정답과 해설을 백과사전 등 출처로 확인하고, 문제가 없으면 마지막 칸에 ✅, 고칠 점이 있으면 메모를 남깁니다.',
  '',
  '- 정답은 하나로 분명한가',
  '- 오답 보기가 그럴듯하지만 정답과 혼동되지 않는가',
  '- 시간이 지나면 바뀔 수 있는 정보(인구, 최신 기록 등)가 아닌가',
  '',
  `총 ${questions.length}문제`,
  '',
]

for (const [category, label] of CATEGORIES) {
  const items = questions.filter((q) => q.category === category)
  const mix = Object.keys(DIFFICULTY)
    .map((d) => `${DIFFICULTY[d]} ${items.filter((q) => q.difficulty === d).length}`)
    .join(' · ')
  lines.push(`## ${label} (${items.length}문제: ${mix})`, '')
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

writeFileSync(new URL('../docs/questions-review.md', import.meta.url), lines.join('\n'))
console.log(`docs/questions-review.md: ${questions.length} questions`)
