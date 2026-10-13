import { useCallback, useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { teacherApi } from './teacherApi'
import { ErrorRetry } from '../components/ErrorRetry'
import { LoginScreen } from './LoginScreen'
import { RosterScreen } from './RosterScreen'
import { SwapScreen } from './SwapScreen'
import styles from './Teacher.module.css'

type View =
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'error'; message: string }
  | { kind: 'login'; notice: string | null }
  | { kind: 'app' }

type Section = 'roster' | 'swap'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'roster', label: '학생 명단' },
  { id: 'swap', label: '문제 교체' },
]

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
  const [section, setSection] = useState<Section>('roster')

  useEffect(() => {
    let active = true
    void sessionView().then((next) => active && setView(next))
    return () => {
      active = false
    }
  }, [])

  const expired = useCallback(() => setView({ kind: 'login', notice: '로그인이 만료되었습니다. 다시 로그인해 주세요.' }), [])

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
          {section === 'roster' && <RosterScreen key="roster" onExpired={expired} />}
          {section === 'swap' && <SwapScreen key="swap" onExpired={expired} />}
        </>
      )}
    </div>
  )
}
