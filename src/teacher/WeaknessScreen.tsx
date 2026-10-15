import { useId, useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type TeacherReport } from '../types/quiz'
import { NoRecords } from './ReportFrame'
import { DIFFICULTY_LABELS, localTime, percent, signed, studentName } from './format'
import styles from './Teacher.module.css'

/** 약점: category rates for the period, and the most missed questions from the last 24 hours. */
export function WeaknessScreen({ report }: { report: TeacherReport }) {
  const selectId = useId()
  const [studentId, setStudentId] = useState('')
  const s = report.summary
  const w = report.weakness
  const byId = new Map(report.students.map((st) => [st.id, st]))
  const played = report.students.filter((st) => st.playCount > 0)
  const student = studentId ? byId.get(Number(studentId)) : undefined
  const fast = new Set(w.fastStudentIds)
  const nameWithFast = (id: number) => `${byId.get(id)!.name}${fast.has(id) ? ' ⏱️' : ''}`
  const classRates = s.categoryRates
  const rows = classRates ? [...CATEGORIES].sort((a, b) => classRates[a] - classRates[b]) : []

  return (
    <>
      <div className={styles.inlineForm}>
        <label htmlFor={selectId} className={styles.label}>
          볼 대상
        </label>
        <select id={selectId} className={styles.select} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">반 전체</option>
          {report.students.map((st) => (
            <option key={st.id} value={st.id}>
              {studentName(st)}
              {st.playCount === 0 ? ' (미응시)' : ''}
            </option>
          ))}
        </select>
      </div>

      <section className={styles.reportSection} aria-labelledby="weak-categories">
        <h2 id="weak-categories" className={styles.panelTitle}>
          카테고리별 약점
        </h2>
        {played.length === 0 || !classRates ? (
          <NoRecords />
        ) : student ? (
          student.categoryRates ? (
            <div className={styles.tableWrap} role="region" aria-labelledby="weak-student-caption" tabIndex={0}>
              <table className={styles.reportTable}>
                <caption id="weak-student-caption" className={styles.caption}>
                  {studentName(student)} 카테고리별 정답률 (낮은 순)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">카테고리</th>
                    <th scope="col">{student.name}</th>
                    <th scope="col">반 평균</th>
                    <th scope="col">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {[...CATEGORIES]
                    .sort((a, b) => student.categoryRates![a] - student.categoryRates![b])
                    .map((c) => (
                      <tr key={c}>
                        <th scope="row">{CATEGORY_LABELS[c]}</th>
                        <td>{percent(student.categoryRates![c])}</td>
                        <td>{percent(classRates[c])}</td>
                        <td>{signed(student.categoryRates![c] - classRates[c], '%p')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>{studentName(student)} 학생은 기간 안에 응시 기록이 없습니다.</p>
          )
        ) : (
          <div className={styles.tableWrap} role="region" aria-labelledby="weak-class-caption" tabIndex={0}>
            <table className={styles.reportTable}>
              <caption id="weak-class-caption" className={styles.caption}>
                반 전체 카테고리별 정답률 (낮은 순)
              </caption>
              <thead>
                <tr>
                  <th scope="col">카테고리</th>
                  <th scope="col">반 정답률</th>
                  <th scope="col">50% 미만 학생</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c}>
                    <th scope="row">{CATEGORY_LABELS[c]}</th>
                    <td>{percent(classRates[c])}</td>
                    <td>
                      {s.below50[c].length === 0
                        ? '없음'
                        : `${s.below50[c].length}명: ${s.below50[c].map((id) => studentName(byId.get(id)!)).join(', ')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.reportSection} aria-labelledby="weak-questions">
        <h2 id="weak-questions" className={styles.panelTitle}>
          많이 틀린 문제
        </h2>
        <p className={styles.help}>
          문제별 답안은 24시간만 보관되므로, 기간과 상관없이 최근 24시간({localTime(w.since)} 이후)에 끝낸 게임만 씁니다. 여러 번 푼
          학생은 가장 최근 게임 하나만 셉니다.
        </p>
        {w.studentIds.length === 0 ? (
          <p className={styles.empty}>최근 24시간 기록이 없어 문제별 분석을 할 수 없습니다.</p>
        ) : student ? (
          <StudentWrongQuestions report={report} studentId={student.id} />
        ) : (
          <>
            {w.questions.length === 0 ? (
              <p className={styles.empty}>3명 이상이 푼 문제 중 틀린 학생이 있는 문제가 없습니다.</p>
            ) : (
              <div className={styles.tableWrap} role="region" aria-labelledby="weak-questions-caption" tabIndex={0}>
                <table className={styles.reportTable}>
                  <caption id="weak-questions-caption" className={styles.caption}>
                    오답률이 높은 문제 {w.questions.length}개 (학생 {w.studentIds.length}명)
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">id</th>
                      <th scope="col">카테고리</th>
                      <th scope="col">난이도</th>
                      <th scope="col">문제</th>
                      <th scope="col">정답</th>
                      <th scope="col">오답률</th>
                      <th scope="col">틀린 학생</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.questions.map((q) => (
                      <tr key={q.questionId}>
                        <td className={styles.qid}>{q.questionId}</td>
                        <td>{CATEGORY_LABELS[q.category]}</td>
                        <td>{DIFFICULTY_LABELS[q.difficulty]}</td>
                        <th scope="row" className={styles.questionCell}>
                          {q.question}
                          {q.reteach && <span className={styles.badge}>다시 가르칠 내용</span>}
                        </th>
                        <td>{q.answer}</td>
                        <td>
                          {percent(q.wrongRate)} ({q.wrongBy}/{q.solvedBy}명)
                        </td>
                        <td className={styles.wrapCell}>{q.wrongStudentIds.map(nameWithFast).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {w.tiedQuestionIds.length > 0 && (
              <p className={styles.help}>표에 넣지 못한 같은 오답률의 문제: {w.tiedQuestionIds.join(', ')}</p>
            )}
            {w.questions.some((q) => q.reteach) && (
              <p className={styles.help}>
                "다시 가르칠 내용"은 쉬운 문제인데 절반 넘게 틀린 문제입니다. 문제 자체가 모호할 수도 있으니 문제 교체 화면이나{' '}
                <code>/quiz-check</code>로 확인해 보세요.
              </p>
            )}
            {w.fastStudentIds.length > 0 && (
              <p className={styles.help}>⏱️: 분석에 쓴 최근 게임이 빠른 기록(80초 미만)인 학생입니다. 빼지 않고 셉니다.</p>
            )}
          </>
        )}
      </section>
    </>
  )
}

function StudentWrongQuestions({ report, studentId }: { report: TeacherReport; studentId: number }) {
  const student = report.students.find((s) => s.id === studentId)!
  const wrong = report.weakness.wrongByStudent[studentId]
  if (!wrong) return <p className={styles.empty}>{studentName(student)} 학생은 최근 24시간에 끝낸 게임이 없습니다.</p>
  if (wrong.length === 0) return <p className={styles.empty}>{studentName(student)} 학생은 최근 게임에서 모두 맞혔습니다.</p>
  return (
    <div className={styles.tableWrap} role="region" aria-labelledby="weak-student-questions" tabIndex={0}>
      <table className={styles.reportTable}>
        <caption id="weak-student-questions" className={styles.caption}>
          {studentName(student)} 학생이 최근 게임에서 틀린 문제 {wrong.length}개
          {report.weakness.fastStudentIds.includes(studentId) ? ' (⏱️ 빠른 기록)' : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">id</th>
            <th scope="col">카테고리</th>
            <th scope="col">난이도</th>
            <th scope="col">문제</th>
            <th scope="col">정답</th>
          </tr>
        </thead>
        <tbody>
          {wrong.map((id) => {
            const q = report.weakness.questionDetails[id]
            return (
              <tr key={id}>
                <td className={styles.qid}>{id}</td>
                <td>{CATEGORY_LABELS[q.category]}</td>
                <td>{DIFFICULTY_LABELS[q.difficulty]}</td>
                <th scope="row" className={styles.questionCell}>
                  {q.question}
                </th>
                <td>{q.answer}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
