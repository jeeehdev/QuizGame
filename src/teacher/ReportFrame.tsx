import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorRetry } from '../components/ErrorRetry'
import type { TeacherReport } from '../types/quiz'
import styles from './Teacher.module.css'

const PRESETS = [
  { value: 'all', label: '전체' },
  { value: 'today', label: '오늘' },
  { value: '7d', label: '최근 7일' },
  { value: '30d', label: '최근 30일' },
] as const
const RANGE = 'range'

/** The report for the chosen period, or why it is not there yet. */
export interface ReportState {
  period: string
  report: TeacherReport | null
  loading: boolean
  error: string | null
}

interface PeriodPickerProps {
  value: string
  onChange: (period: string) => void
}

/** Period choice shared by the report screens: presets apply at once, a date range applies with its button. */
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const id = useId()
  const isPreset = PRESETS.some((p) => p.value === value)
  const [mode, setMode] = useState(isPreset ? value : RANGE)
  const [initialFrom, initialTo] = isPreset ? ['', ''] : value.split('~')
  const [from, setFrom] = useState(initialFrom ?? '')
  const [to, setTo] = useState(initialTo ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  function choose(next: string) {
    setMode(next)
    setProblem(null)
    if (next !== RANGE) onChange(next)
  }

  function applyRange(event: FormEvent) {
    event.preventDefault()
    if (!from || !to) return setProblem('시작 날짜와 끝 날짜를 모두 입력해 주세요.')
    if (from > to) return setProblem('시작 날짜가 끝 날짜보다 늦습니다.')
    setProblem(null)
    onChange(`${from}~${to}`)
  }

  return (
    <form className={styles.periodPicker} onSubmit={applyRange}>
      <fieldset className={styles.periodFieldset}>
        <legend className={styles.legend}>기간</legend>
        <div className={styles.periodOptions}>
          {[...PRESETS, { value: RANGE, label: '날짜 지정' }].map((p) => (
            <label key={p.value} className={styles.periodOption}>
              <input type="radio" name={`${id}-period`} value={p.value} checked={mode === p.value} onChange={() => choose(p.value)} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === RANGE && (
        <div className={styles.rangeRow}>
          <label className={styles.field}>
            <span className={styles.label}>시작 날짜</span>
            <input type="date" className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>끝 날짜</span>
            <input type="date" className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="submit" className={styles.secondary}>
            적용
          </button>
        </div>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}

interface ReportFrameProps {
  title: string
  state: ReportState
  onPeriodChange: (period: string) => void
  onRefresh: () => void
  children: (report: TeacherReport) => ReactNode
}

/** Heading, period choice, report header and loading/error states around one report screen. */
export function ReportFrame({ title, state, onPeriodChange, onRefresh, children }: ReportFrameProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const { report } = state
  const summary = report?.summary

  return (
    <main className={styles.screen}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      <div className={styles.reportBar}>
        <PeriodPicker value={state.period} onChange={onPeriodChange} />
        <button type="button" className={styles.secondary} onClick={onRefresh} disabled={state.loading}>
          새로 고침
        </button>
      </div>
      <p className={styles.liveStatus} role="status">
        {state.loading ? '성적을 불러오는 중…' : ''}
      </p>
      {state.error && <ErrorRetry message={state.error} onRetry={onRefresh} />}
      {report && summary && (
        <>
          <p className={styles.reportHeader}>
            <strong>{report.className || '반 이름 없음'}</strong> · {report.period.label} · 학생 {summary.studentCount}명 · 응시{' '}
            {summary.playedCount}명 · 기록 {summary.recordCount}건
          </p>
          {children(report)}
        </>
      )}
    </main>
  )
}

/** Shown in place of class statistics when nobody on the roster played in the period. */
export function NoRecords() {
  return <p className={styles.empty}>기간 안에 응시 기록이 없습니다.</p>
}
