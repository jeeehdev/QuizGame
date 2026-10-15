import { useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type Grade, type ReportStudent, type TeacherReport } from '../types/quiz'
import { NoRecords } from './ReportFrame'
import { duration, FLAG_LABELS, localTime, percent, score, signed } from './format'
import styles from './Teacher.module.css'

type SortKey = 'number' | 'grade' | 'best' | 'average' | 'recent'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'number', label: '번호' },
  { key: 'grade', label: '등급' },
  { key: 'best', label: '최고' },
  { key: 'average', label: '평균' },
  { key: 'recent', label: '최근' },
]
const GRADES: Grade[] = ['A', 'B', 'C', 'D']
const BANDS = ['0~99', '100~199', '200~299', '300~399', '400']

/** Number order, grade A → D, or score high → low. Students without a value go last; ties keep number order. */
function sortStudents(students: ReportStudent[], key: SortKey): ReportStudent[] {
  if (key === 'number') return students
  const value = (s: ReportStudent): number | null => {
    if (key === 'grade') return s.grade === null ? null : -GRADES.indexOf(s.grade) * 1000 + (s.average ?? 0)
    return s[key]
  }
  return [...students].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || vb === null) return va === vb ? a.number - b.number : va === null ? 1 : -1
    return vb - va || a.number - b.number
  })
}

export function Flag({ student }: { student: ReportStudent }) {
  if (!student.flag) return null
  const { icon, text } = FLAG_LABELS[student.flag]
  return (
    <span className={styles.flag} title={text}>
      <span aria-hidden="true">{icon}</span>
      <span className={styles.srOnly}>({text})</span>
    </span>
  )
}

interface Props {
  report: TeacherReport
  onOpenRoster: () => void
}

/** 성적표: class summary and one row per student with grade, rank, category rates and fast records. */
export function ScoresScreen({ report, onOpenRoster }: Props) {
  const [sort, setSort] = useState<SortKey>('number')
  const s = report.summary
  const byId = new Map(report.students.map((st) => [st.id, st]))

  return (
    <>
      {s.fastWarning && (
        <p className={styles.warning}>
          주의: 기록 {s.recordCount}건 중 {s.fastCount}건이 빠른 기록(⏱️ 80초 미만)이라 결과를 실력으로 보기 어렵습니다.
        </p>
      )}
      {s.unmatchedRecordCount > 0 && (
        <p className={styles.notice}>
          명단에 없는 닉네임의 기록 {s.unmatchedRecordCount}건은 성적에 넣지 않았습니다.{' '}
          <button type="button" className={styles.linkButton} onClick={onOpenRoster}>
            학생 명단에서 연결하기
          </button>
        </p>
      )}
      {s.playedCount === 0 ? (
        <NoRecords />
      ) : (
        <section className={styles.panel} aria-labelledby="scores-summary">
          <h2 id="scores-summary" className={styles.panelTitle}>
            반 요약
          </h2>
          <dl className={styles.stats}>
            <div>
              <dt>응시</dt>
              <dd>
                {s.playedCount}/{s.studentCount}명 ({percent((s.playedCount / s.studentCount) * 100)})
              </dd>
            </div>
            <div>
              <dt>반 평균</dt>
              <dd>{score(s.average)}점</dd>
            </div>
            <div>
              <dt>표준편차</dt>
              <dd>{s.stdDev === null ? '응시 3명 미만' : score(s.stdDev)}</dd>
            </div>
            <div>
              <dt>학생 평균의 중앙값 · 최고 · 최저</dt>
              <dd>
                {score(s.median)} · {score(s.highestAverage)} · {score(s.lowestAverage)}
              </dd>
            </div>
            <div>
              <dt>반 최고 기록</dt>
              <dd>
                {s.bestRecord!.score}점 ({s.bestRecord!.studentIds.map((id) => byId.get(id)!.name).join(', ')})
              </dd>
            </div>
            <div>
              <dt>빠른 기록 ⏱️</dt>
              <dd>
                {s.fastCount}건 ({percent((s.fastCount / s.recordCount) * 100)})
              </dd>
            </div>
            <div>
              <dt>등급</dt>
              <dd>{s.gradesAssigned ? GRADES.map((g) => `${g} ${s.gradeCounts[g]}명`).join(' · ') : '응시 학생이 5명 미만이라 등급을 매기지 않습니다'}</dd>
            </div>
            <div>
              <dt>최고 점수 구간</dt>
              <dd>{BANDS.map((band, i) => `${band}: ${s.scoreBands[i]}명`).join(' · ')}</dd>
            </div>
            <div>
              <dt>최근 24시간 중간에 나간 게임</dt>
              <dd>{s.abandonedRecent}건</dd>
            </div>
          </dl>
        </section>
      )}

      <div className={styles.tableWrap} role="region" aria-labelledby="scores-caption" tabIndex={0}>
        <table className={styles.reportTable}>
          <caption id="scores-caption" className={styles.caption}>
            학생별 성적표 ({SORTS.find((x) => x.key === sort)!.label} 순)
          </caption>
          <thead>
            <tr>
              <SortHeader sortKey="number" label="번호" current={sort} onSort={setSort} />
              <th scope="col">이름</th>
              <SortHeader sortKey="grade" label="등급" current={sort} onSort={setSort} />
              <th scope="col">순위</th>
              <th scope="col">응시</th>
              {SORTS.slice(2).map((x) => (
                <SortHeader key={x.key} sortKey={x.key} label={x.label} current={sort} onSort={setSort} />
              ))}
              <th scope="col">반 평균 대비</th>
              {CATEGORIES.map((c) => (
                <th key={c} scope="col">
                  {CATEGORY_LABELS[c]}
                </th>
              ))}
              <th scope="col">평균 시간</th>
              <th scope="col">빠른 기록</th>
              <th scope="col">마지막 플레이</th>
            </tr>
          </thead>
          <tbody>
            {sortStudents(report.students, sort).map((st) => (
              <tr key={st.id}>
                <td>{st.number}</td>
                <th scope="row">
                  {st.name} <Flag student={st} />
                </th>
                {st.playCount === 0 ? (
                  <td colSpan={14} className={styles.muted}>
                    미응시
                  </td>
                ) : (
                  <>
                    <td>{st.grade ?? '-'}</td>
                    <td>
                      {st.rank}/{s.playedCount}
                    </td>
                    <td>{st.playCount}</td>
                    <td>{st.best}</td>
                    <td>{score(st.average)}</td>
                    <td>{st.recent}</td>
                    <td>{signed(st.vsClass)}</td>
                    {CATEGORIES.map((c) => (
                      <td key={c}>{percent(st.categoryRates![c])}</td>
                    ))}
                    <td>{duration(st.averageDurationSec)}</td>
                    <td>{st.fastCount > 0 ? `⏱️ ${st.fastCount}/${st.playCount}건` : '-'}</td>
                    <td>{localTime(st.lastPlayedAt!)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.help}>
        등급은 반 안의 상대 위치입니다(평균 점수 순위 상위 20% A, 40% B, 70% C, 나머지 D).{' '}
        {s.flagsShown
          ? '⚠️는 반 평균보다 한 표준편차 이상 낮은 학생, ⭐는 높은 학생입니다.'
          : '응시 학생이 3명 미만이라 ⚠️·⭐ 표시를 하지 않습니다.'}{' '}
        빠른 기록도 모든 계산에 그대로 넣습니다.
      </p>
    </>
  )
}

interface SortHeaderProps {
  sortKey: SortKey
  label: string
  current: SortKey
  onSort: (key: SortKey) => void
}

function SortHeader({ sortKey, label, current, onSort }: SortHeaderProps) {
  const active = current === sortKey
  const direction = sortKey === 'number' || sortKey === 'grade' ? 'ascending' : 'descending'
  return (
    <th scope="col" aria-sort={active ? direction : undefined}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true">{active ? (direction === 'ascending' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
}
