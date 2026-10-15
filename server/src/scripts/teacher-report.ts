// Prints the teacher report (same calculation as GET /api/teacher/report). Opens the database read-only.
// Usage: npm run teacher-report -- [기간] [--json] [--compare 1,3,5|all]
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { CATEGORIES, CATEGORY_LABELS, type Category, type ReportStudent, type TeacherReport } from '../../../shared/types.ts'
import { config } from '../config.ts'
import { loadQuestionFile } from '../game/validateQuestions.ts'
import { loadCandidateFile } from '../questionBank.ts'
import { parsePeriod, PeriodError } from '../teacher/period.ts'
import { ReportError } from '../teacher/report.ts'
import { getTeacherReport } from '../teacher/reportData.ts'
import { parseCompare } from '../teacherReport.ts'

const USAGE = `사용법: npm run teacher-report -- [기간] [--json] [--compare <번호,번호,…|all>]
  기간: all(기본), today, 7d, 30d, YYYY-MM-DD~YYYY-MM-DD`

const args = process.argv.slice(2)
const json = args.includes('--json')
const compareAt = args.indexOf('--compare')
const compareText = compareAt >= 0 ? args[compareAt + 1] : undefined
const rest = args.filter((a, i) => a !== '--json' && (compareAt < 0 || (i !== compareAt && i !== compareAt + 1)))

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (rest.length > 1 || rest.some((a) => a.startsWith('--')) || (compareAt >= 0 && !compareText)) fail(USAGE)
if (!existsSync(config.dbPath)) fail(`DB 파일이 없습니다: ${config.dbPath}`)

const now = Date.now()
let report: TeacherReport
try {
  const period = parsePeriod(rest[0], new Date(now))
  const compare = compareText === undefined ? undefined : parseCompare(compareText)
  if (compare === null) fail(`--compare에는 출석 번호를 쉼표로 이어 쓰거나 all을 씁니다.\n${USAGE}`)
  const bank = loadQuestionFile(config.questionsPath)
  const questions = new Map([...loadCandidateFile(config.candidatesPath, bank), ...bank].map((q) => [q.id, q]))
  const db = new Database(config.dbPath, { readonly: true, fileMustExist: true })
  try {
    report = getTeacherReport(db, period, now, questions, compare)
  } finally {
    db.close()
  }
} catch (error) {
  if (error instanceof PeriodError || error instanceof ReportError) fail(error.message)
  throw error
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printText(report)
}

function printText(r: TeacherReport) {
  const s = r.summary
  const n = (v: number | null) => (v === null ? '-' : String(Math.round(v)))
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${Math.round(v)}%`)
  const signed = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v))}`)
  const label = (st: ReportStudent) => `${st.number} ${st.name}`
  const byId = new Map(r.students.map((st) => [st.id, st]))
  const names = (ids: number[]) => ids.map((id) => label(byId.get(id)!)).join(', ') || '-'
  const cats = (list: Category[]) => (list.length === CATEGORIES.length ? '차이 없음' : list.map((c) => CATEGORY_LABELS[c]).join(', '))
  const flag = (st: ReportStudent) => (st.flag === 'warning' ? '⚠️' : st.flag === 'star' ? '⭐' : '')
  const trend = (st: ReportStudent) => ({ up: '📈', down: '📉', flat: '➡️' })[st.trend ?? 'flat'] ?? '-'

  console.log(`# ${r.className || '(반 이름 없음)'} · ${r.period.label}`)
  console.log(`학생 ${s.studentCount}명 · 응시 ${s.playedCount}명 · 기록 ${s.recordCount}건 · 미등록 기록 ${s.unmatchedRecordCount}건 · 최근 24시간 중간에 나간 게임 ${s.abandonedRecent}건`)
  if (s.playedCount === 0) {
    console.log('기간 안에 응시 기록이 없습니다.')
    return
  }
  if (s.fastWarning) console.log(`주의: 기록 ${s.recordCount}건 중 ${s.fastCount}건이 빠른 기록(⏱️)이라 결과를 실력으로 보기 어렵습니다.`)
  console.log(`반 평균 ${n(s.average)} · 표준편차 ${n(s.stdDev)} · 중앙값 ${n(s.median)} · 최고 ${n(s.highestAverage)} · 최저 ${n(s.lowestAverage)}`)
  console.log(`반 최고 기록 ${s.bestRecord!.score}점 (${names(s.bestRecord!.studentIds)}) · 빠른 기록 ${s.fastCount}건`)
  console.log(`등급: ${s.gradesAssigned ? `A ${s.gradeCounts.A} · B ${s.gradeCounts.B} · C ${s.gradeCounts.C} · D ${s.gradeCounts.D}` : '응시 학생이 5명 미만이라 등급을 매기지 않습니다'}`)
  console.log(`카테고리 정답률: ${CATEGORIES.map((c) => `${CATEGORY_LABELS[c]} ${pct(s.categoryRates?.[c])}`).join(' · ')}`)

  console.log('\n## 성적표')
  console.log(['번호 이름', '등급', '순위', '응시', '최고', '평균', '최근', '대비', ...CATEGORIES.map((c) => CATEGORY_LABELS[c]), '빠른', '추세'].join('\t'))
  for (const st of r.students) {
    if (st.playCount === 0) {
      console.log(`${label(st)}\t미응시`)
      continue
    }
    console.log([
      `${label(st)} ${flag(st)}`.trim(),
      st.grade ?? '-',
      `${st.rank}/${s.playedCount}`,
      st.playCount,
      st.best,
      n(st.average),
      st.recent,
      signed(st.vsClass),
      ...CATEGORIES.map((c) => pct(st.categoryRates![c])),
      st.fastCount > 0 ? `${st.fastCount}/${st.playCount}` : '-',
      st.trend ? `${trend(st)} ${signed(st.change)}` : '-',
    ].join('\t'))
  }

  console.log('\n## 많이 틀린 문제 (기간 안, 학생마다 최근 게임 하나)')
  if (r.weakness.recordsWithoutAnswers > 0) console.log(`문제별 답안이 없는 예전 기록 ${r.weakness.recordsWithoutAnswers}건은 빠졌습니다.`)
  if (r.weakness.studentIds.length === 0) {
    console.log('기간 안에 문제별 답안이 있는 기록이 없어 문제별 분석을 할 수 없습니다.')
  } else {
    for (const q of r.weakness.questions) {
      console.log(`${q.questionId}\t${pct(q.wrongRate)} (${q.wrongBy}/${q.solvedBy})${q.reteach ? ' 다시 가르칠 내용' : ''}\t${q.question}\t틀린 학생: ${names(q.wrongStudentIds)}`)
    }
    if (r.weakness.tiedQuestionIds.length > 0) console.log(`같은 오답률: ${r.weakness.tiedQuestionIds.join(', ')}`)
  }

  console.log('\n## 학생 비교')
  if (!r.compare) {
    console.log(r.compareSkipped)
  } else {
    console.log(`대상: ${names(r.compare.studentIds)}`)
    for (const st of r.compare.studentIds.map((id) => byId.get(id)!)) {
      console.log(`${label(st)}: 강한 ${cats(st.strongCategories)} · 약한 ${cats(st.weakCategories)}`)
    }
    for (const g of r.compare.gaps) {
      console.log(`${CATEGORY_LABELS[g.category]} 차이 ${Math.round(g.difference)}%p: 높음 ${names(g.highIds)} · 낮음 ${names(g.lowIds)}`)
    }
  }
}
