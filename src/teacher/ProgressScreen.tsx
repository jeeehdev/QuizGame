import { useId, useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type ReportStudent, type TeacherReport } from '../types/quiz'
import { NoRecords } from './ReportFrame'
import { duration, localTime, score, signed, studentName, TREND_LABELS } from './format'
import styles from './Teacher.module.css'

function TrendMark({ student }: { student: ReportStudent }) {
  if (!student.trend) return <>-</>
  const { icon, text } = TREND_LABELS[student.trend]
  return (
    <>
      <span aria-hidden="true">{icon}</span> {text}
    </>
  )
}

/** 추이: change per student, the class average per day, and one student's records over time. */
export function ProgressScreen({ report }: { report: TeacherReport }) {
  const selectId = useId()
  const [studentId, setStudentId] = useState('')
  const played = report.students.filter((s) => s.playCount > 0)
  if (played.length === 0) return <NoRecords />

  const student = studentId ? report.students.find((s) => s.id === Number(studentId)) : undefined
  const changed = played.filter((s) => s.change !== null)
  const risers = changed.filter((s) => s.change! > 0).sort((a, b) => b.change! - a.change! || a.number - b.number).slice(0, 3)
  const fallers = changed.filter((s) => s.change! < 0).sort((a, b) => a.change! - b.change! || a.number - b.number)

  return (
    <>
      <div className={styles.inlineForm}>
        <label htmlFor={selectId} className={styles.label}>
          볼 대상
        </label>
        <select id={selectId} className={styles.select} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">반 전체</option>
          {played.map((s) => (
            <option key={s.id} value={s.id}>
              {studentName(s)}
            </option>
          ))}
        </select>
      </div>

      {student ? (
        <StudentProgress student={student} />
      ) : (
        <>
          <section className={styles.reportSection} aria-labelledby="progress-students">
            <h2 id="progress-students" className={styles.panelTitle}>
              학생별 변화
            </h2>
            <div className={styles.tableWrap} role="region" aria-labelledby="progress-caption" tabIndex={0}>
              <table className={styles.reportTable}>
                <caption id="progress-caption" className={styles.caption}>
                  첫 기록과 최근 기록 (±30점 이상이면 향상·하락)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">이름</th>
                    <th scope="col">응시</th>
                    <th scope="col">첫 점수</th>
                    <th scope="col">최근 점수</th>
                    <th scope="col">변화</th>
                    <th scope="col">최고 점수</th>
                    <th scope="col">추세</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.number}</td>
                      <th scope="row">{s.name}</th>
                      {s.playCount === 0 ? (
                        <td colSpan={6} className={styles.muted}>
                          미응시
                        </td>
                      ) : (
                        <>
                          <td>{s.playCount}</td>
                          <td>{s.first}</td>
                          <td>{s.recent}</td>
                          <td>{signed(s.change)}</td>
                          <td>{s.best}</td>
                          <td>
                            <TrendMark student={s} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={styles.list}>
              <li>가장 많이 오른 학생: {risers.length === 0 ? '없음' : risers.map((s) => `${s.name}(${signed(s.change)})`).join(', ')}</li>
              <li>떨어진 학생: {fallers.length === 0 ? '없음' : fallers.map((s) => `${s.name}(${signed(s.change)})`).join(', ')}</li>
            </ul>
            <p className={styles.help}>응시 횟수가 적으면 변화가 우연일 수 있습니다. 1회만 응시한 학생은 추세를 계산하지 않습니다.</p>
          </section>

          <section className={styles.reportSection} aria-labelledby="progress-daily">
            <h2 id="progress-daily" className={styles.panelTitle}>
              날짜별 반 평균
            </h2>
            <div className={styles.tableWrap} role="region" aria-labelledby="daily-caption" tabIndex={0}>
              <table className={styles.reportTable}>
                <caption id="daily-caption" className={styles.caption}>
                  기록이 있는 최근 {report.daily.length}일 (그날 응시한 학생별 평균의 평균)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">날짜</th>
                    <th scope="col">반 평균</th>
                    <th scope="col">응시 학생</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{d.date}</th>
                      <td>{score(d.average)}점</td>
                      <td>{d.studentCount}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}

function StudentProgress({ student }: { student: ReportStudent }) {
  const best = Math.max(...student.records.map((r) => r.score))
  const bestRound = student.records.findIndex((r) => r.score === best) + 1
  return (
    <section className={styles.reportSection} aria-labelledby="progress-student">
      <h2 id="progress-student" className={styles.panelTitle}>
        {studentName(student)}의 기록
      </h2>
      {student.records.length < 2 ? (
        <p className={styles.notice}>기록이 1회뿐이라 추이를 계산할 수 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          <li>
            첫 기록 → 최근 기록: {student.first}점 → {student.recent}점 ({signed(student.change)}, <TrendMark student={student} />)
          </li>
          <li>
            최고 점수: {best}점 ({bestRound}회차)
          </li>
          <li>
            카테고리 변화({student.records.length >= 4 ? '처음 2회 → 최근 2회' : '처음 1회 → 최근 1회'}):{' '}
            {CATEGORIES.map((c) => `${CATEGORY_LABELS[c]} ${signed(student.categoryChange![c], '%p')}`).join(' · ')}
          </li>
        </ul>
      )}
      <div className={styles.tableWrap} role="region" aria-labelledby="records-caption" tabIndex={0}>
        <table className={styles.reportTable}>
          <caption id="records-caption" className={styles.caption}>
            회차별 기록 (카테고리는 10문제 중 맞힌 수)
          </caption>
          <thead>
            <tr>
              <th scope="col">회차</th>
              <th scope="col">플레이 시각</th>
              <th scope="col">닉네임</th>
              <th scope="col">점수</th>
              <th scope="col">직전 대비</th>
              {CATEGORIES.map((c) => (
                <th key={c} scope="col">
                  {CATEGORY_LABELS[c]}
                </th>
              ))}
              <th scope="col">소요 시간</th>
            </tr>
          </thead>
          <tbody>
            {student.records.map((r, i) => (
              <tr key={r.scoreId}>
                <th scope="row">{i + 1}회</th>
                <td>{localTime(r.playedAt)}</td>
                <td>{r.nickname}</td>
                <td>{r.score}</td>
                <td>{signed(r.change)}</td>
                {CATEGORIES.map((c) => (
                  <td key={c}>{r.correctByCategory[c]}</td>
                ))}
                <td>
                  {duration(r.durationSec)}
                  {r.fast && (
                    <>
                      {' '}
                      <span aria-hidden="true">⏱️</span>
                      <span className={styles.srOnly}>(빠른 기록)</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
