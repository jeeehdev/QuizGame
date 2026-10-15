import { useCallback, useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../api/client'
import type { TeacherReport } from '../types/quiz'
import { fetchResult, teacherApi, type Loaded } from './teacherApi'
import { ErrorRetry } from '../components/ErrorRetry'
import { CompareScreen } from './CompareScreen'
import { LoginScreen } from './LoginScreen'
import { ProgressScreen } from './ProgressScreen'
import { ReportFrame, type ReportState } from './ReportFrame'
import { RosterScreen } from './RosterScreen'
import { ScoresScreen } from './ScoresScreen'
import { SwapScreen } from './SwapScreen'
import { WeaknessScreen } from './WeaknessScreen'
import styles from './Teacher.module.css'

type View =
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'error'; message: string }
  | { kind: 'login'; notice: string | null }
  | { kind: 'app' }

type ReportSection = 'scores' | 'compare' | 'weakness' | 'progress'
type Section = ReportSection | 'roster' | 'swap'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'scores', label: '성적표' },
  { id: 'compare', label: '학생 비교' },
  { id: 'weakness', label: '약점' },
  { id: 'progress', label: '추이' },
  { id: 'roster', label: '학생 명단' },
  { id: 'swap', label: '문제 교체' },
]
const isReportSection = (section: Section): section is ReportSection => !['roster', 'swap'].includes(section)

/** A finished report request: which period and refresh it answers, and its result. */
interface LoadedReport {
  period: string
  version: number
  result: Loaded<TeacherReport>
}

/** Asks the server whether a teacher session exists and returns the view to show. */
async function sessionView(): Promise<View> {
  try {
    await teacherApi.session()
    return { kind: 'app' }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { kind: 'login', notice: null }
    if (error instanceof ApiError && error.status === 404) return { kind: 'off' }
    return { kind: 'error', message: errorMessage(error) }
  }
}

/** Teacher mode at /teacher: checks the session, then shows the login or the teacher screens. */
export default function TeacherApp() {
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [section, setSection] = useState<Section>('scores')
  // The report screens share one report per period. It is fetched again when a report screen is opened
  // (the roster may have changed meanwhile) and when the teacher asks for a refresh (version).
  const [period, setPeriod] = useState('all')
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState<LoadedReport | null>(null)
  const wantsReport = view.kind === 'app' && isReportSection(section)

  useEffect(() => {
    let active = true
    void sessionView().then((next) => active && setView(next))
    return () => {
      active = false
    }
  }, [])

  const expired = useCallback(() => setView({ kind: 'login', notice: '로그인이 만료되었습니다. 다시 로그인해 주세요.' }), [])

  useEffect(() => {
    if (!wantsReport) return
    let active = true
    void fetchResult(() => teacherApi.report(period)).then((result) => {
      if (!active) return
      if ('error' in result && result.error instanceof ApiError && result.error.status === 401) return expired()
      setLoaded({ period, version, result })
    })
    return () => {
      active = false
    }
  }, [wantsReport, period, version, expired])

  // Keep showing the previous report of the same period while a refresh runs; a new period starts empty.
  const current = loaded?.period === period ? loaded : null
  const reportState: ReportState = {
    period,
    report: current && 'data' in current.result ? current.result.data : null,
    loading: !current || current.version !== version,
    error: current && 'error' in current.result && current.version === version ? errorMessage(current.result.error) : null,
  }
  const refresh = () => setVersion((v) => v + 1)

  async function logout() {
    try {
      await teacherApi.logout()
    } catch {
      // The session ends on the server anyway after 30 minutes; show the login screen regardless.
    }
    setView({ kind: 'login', notice: '로그아웃했습니다.' })
  }

  return (
    <div className={styles.app} lang="ko">
      <header className={styles.header}>
        <span className={styles.brand}>상식 퀴즈 · 선생님 모드</span>
        <a className={styles.studentLink} href="/">
          학생 화면으로
        </a>
      </header>
      {view.kind === 'checking' && <p className={styles.status}>확인하는 중…</p>}
      {view.kind === 'off' && (
        <main className={styles.screen}>
          <h1 className={styles.title}>선생님 모드가 꺼져 있습니다</h1>
          <p className={styles.help}>
            서버를 시작할 때 환경 변수 <code>TEACHER_PASSWORD</code>(8자 이상)를 설정하면 켜집니다.
          </p>
        </main>
      )}
      {view.kind === 'error' && (
        <main className={styles.screen}>
          <h1 className={styles.title}>선생님 모드</h1>
          <ErrorRetry
            message={view.message}
            onRetry={() => {
              setView({ kind: 'checking' })
              void sessionView().then(setView)
            }}
          />
        </main>
      )}
      {view.kind === 'login' && <LoginScreen notice={view.notice} onLoggedIn={() => setView({ kind: 'app' })} />}
      {view.kind === 'app' && (
        <>
          <nav className={styles.nav} aria-label="선생님 메뉴">
            <ul className={styles.navList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.navItem}
                    aria-current={section === s.id ? 'page' : undefined}
                    onClick={() => setSection(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.secondary} onClick={() => void logout()}>
              로그아웃
            </button>
          </nav>
          {isReportSection(section) && (
            <ReportFrame
              key={section}
              title={SECTIONS.find((s) => s.id === section)!.label}
              state={reportState}
              onPeriodChange={setPeriod}
              onRefresh={refresh}
            >
              {(report) => (
                <>
                  {section === 'scores' && <ScoresScreen report={report} onOpenRoster={() => setSection('roster')} />}
                  {section === 'compare' && <CompareScreen key={report.generatedAt} report={report} onExpired={expired} />}
                  {section === 'weakness' && <WeaknessScreen report={report} />}
                  {section === 'progress' && <ProgressScreen report={report} />}
                </>
              )}
            </ReportFrame>
          )}
          {section === 'roster' && <RosterScreen key="roster" onExpired={expired} />}
          {section === 'swap' && <SwapScreen key="swap" onExpired={expired} />}
        </>
      )}
    </div>
  )
}
