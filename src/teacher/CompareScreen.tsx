import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { CATEGORIES, CATEGORY_LABELS, type CompareItem, type ReportCompare, type ReportStudent, type TeacherReport } from '../types/quiz'
import { NoRecords } from './ReportFrame'
import { Flag } from './ScoresScreen'
import { categoryList, duration, percent, score, signed, studentName } from './format'
import { teacherApi } from './teacherApi'
import styles from './Teacher.module.css'

const REASONS: Record<ReportCompare['reason'], string> = {
  requested: '고른 학생',
  flagged: '⚠️·⭐ 표시된 학생',
  topBottom: '평균 점수 상위 2명과 하위 2명',
}

interface Row {
  label: string
  item?: CompareItem
  value: (s: ReportStudent) => ReactNode
}

const ROWS: Row[] = [
  { label: '응시 횟수', item: 'playCount', value: (s) => `${s.playCount}회` },
  { label: '최고 점수', item: 'best', value: (s) => s.best },
  { label: '평균 점수', item: 'average', value: (s) => score(s.average) },
  { label: '최근 점수', item: 'recent', value: (s) => s.recent },
  { label: '평균 소요 시간', item: 'averageDurationSec', value: (s) => duration(s.averageDurationSec) },
  { label: '빠른 기록 ⏱️', item: 'fastCount', value: (s) => `${s.fastCount}건` },
  ...CATEGORIES.map((c): Row => ({ label: CATEGORY_LABELS[c], item: c, value: (s) => percent(s.categoryRates![c]) })),
  { label: '반 안 순위', item: 'rank', value: (s) => s.rank },
  { label: '등급', value: (s) => s.grade ?? '-' },
  { label: '강한 카테고리', value: (s) => categoryList(s.strongCategories) },
  { label: '약한 카테고리', value: (s) => categoryList(s.weakCategories) },
]

interface Props {
  report: TeacherReport
  onExpired: () => void
}

/** 학생 비교: pick two or more students and see them side by side. Starts with the server's default choice. */
export function CompareScreen({ report, onExpired }: Props) {
  const played = report.students.filter((s) => s.playCount > 0)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(report.compare?.studentIds ?? []))
  const [result, setResult] = useState<{ compare: ReportCompare; students: ReportStudent[] } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (played.length === 0) return <NoRecords />

  const shown = result ?? (report.compare ? { compare: report.compare, students: report.students } : null)

  function toggle(id: number) {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }

  async function compare(event: FormEvent) {
    event.preventDefault()
    const numbers = report.students.filter((s) => chosen.has(s.id)).map((s) => s.number)
    if (numbers.length < 2) return setProblem('비교하려면 학생을 2명 이상 골라 주세요.')
    setProblem(null)
    setBusy(true)
    try {
      const next = await teacherApi.report(report.period.key, numbers)
      setResult({ compare: next.compare!, students: next.students })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onExpired()
      setProblem(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className={styles.panel} onSubmit={(e) => void compare(e)}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>비교할 학생 (응시한 학생 중 2명 이상)</legend>
          <div className={styles.checkGrid}>
            {played.map((s) => (
              <label key={s.id} className={styles.checkOption}>
                <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
                {studentName(s)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.inlineForm}>
          <button type="submit" className={styles.primary} disabled={busy}>
            비교하기
          </button>
          <span className={styles.muted}>{chosen.size}명 선택</span>
        </div>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
      </form>

      {!shown && <p className={styles.empty}>{report.compareSkipped}</p>}
      {shown && <CompareResult compare={shown.compare} students={shown.students} report={report} />}
    </>
  )
}

function CompareResult({ compare, students, report }: { compare: ReportCompare; students: ReportStudent[]; report: TeacherReport }) {
  const byId = new Map(students.map((s) => [s.id, s]))
  const targets = compare.studentIds.map((id) => byId.get(id)!)
  const names = (ids: number[]) => ids.map((id) => byId.get(id)!.name).join(', ')
  const classRates = report.summary.categoryRates

  return (
    <section className={styles.reportSection} aria-labelledby="compare-result">
      <h2 id="compare-result" className={styles.panelTitle}>
        비교 결과: {REASONS[compare.reason]}
      </h2>
      <div className={styles.tableWrap} role="region" aria-labelledby="compare-caption" tabIndex={0}>
        <table className={styles.reportTable}>
          <caption id="compare-caption" className={styles.caption}>
            나란히 보기 (굵은 값이 가장 좋음)
          </caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              {targets.map((s) => (
                <th key={s.id} scope="col">
                  {studentName(s)} <Flag student={s} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {targets.map((s) => (
                  <td key={s.id}>
                    {s.playCount === 0 ? (
                      <span className={styles.muted}>미응시</span>
                    ) : row.item && compare.best[row.item]?.includes(s.id) ? (
                      <>
                        <strong>{row.value(s)}</strong>
                        <span className={styles.srOnly}> (가장 좋음)</span>
                      </>
                    ) : (
                      row.value(s)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {classRates && (
        <div className={styles.tableWrap} role="region" aria-labelledby="compare-class-caption" tabIndex={0}>
          <table className={styles.reportTable}>
            <caption id="compare-class-caption" className={styles.caption}>
              반 평균 정답률과의 차이 (%p)
            </caption>
            <thead>
              <tr>
                <th scope="col">카테고리</th>
                <th scope="col">반 평균</th>
                {targets.map((s) => (
                  <th key={s.id} scope="col">
                    {studentName(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c}>
                  <th scope="row">{CATEGORY_LABELS[c]}</th>
                  <td>{percent(classRates[c])}</td>
                  {targets.map((s) => (
                    <td key={s.id}>{s.categoryRates ? signed(s.categoryRates[c] - classRates[c], '%p') : '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.subTitle}>차이가 큰 부분</h3>
      {compare.gaps.length === 0 && compare.closeScores.length === 0 ? (
        <p className={styles.muted}>정답률 차이가 20%p 이상인 카테고리가 없고, 평균 점수가 10점 이내인 학생도 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {compare.gaps.map((g) => (
            <li key={g.category}>
              {CATEGORY_LABELS[g.category]}: {Math.round(g.difference)}%p 차이 — 높음 {names(g.highIds)}, 낮음 {names(g.lowIds)}
            </li>
          ))}
          {compare.closeScores.map(({ studentIds: [a, b], scoreDifference, durationDifference }) => (
            <li key={`${a}-${b}`}>
              {names([a])}·{names([b])}: 평균 점수 차이 {Math.abs(Math.round(scoreDifference))}점, 평균 시간은{' '}
              {Math.round(durationDifference) === 0
                ? '같습니다'
                : `${names([durationDifference < 0 ? a : b])}이(가) ${duration(Math.abs(durationDifference))} 빠릅니다`}
            </li>
          ))}
        </ul>
      )}

      <h3 className={styles.subTitle}>서로 가르쳐 줄 수 있는 짝</h3>
      {compare.teachingPairs.length === 0 ? (
        <p className={styles.muted}>한 학생의 강한 카테고리가 다른 학생의 약한 카테고리인 경우가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {compare.teachingPairs.map((p) => (
            <li key={`${p.tutorId}-${p.learnerId}-${p.category}`}>
              {CATEGORY_LABELS[p.category]}: {names([p.tutorId])} → {names([p.learnerId])}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
