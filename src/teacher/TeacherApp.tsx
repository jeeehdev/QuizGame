import { useCallback, useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { teacherApi } from './teacherApi'
import { ErrorRetry } from '../components/ErrorRetry'
import { LoginScreen } from './LoginScreen'
import { SwapScreen } from './SwapScreen'
import styles from './Teacher.module.css'

type View =
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'error'; message: string }
  | { kind: 'login'; notice: string | null }
  | { kind: 'swap' }

/** Teacher mode at /teacher: checks the session, then shows the login or the question swap screen. */
export default function TeacherApp() {
  const [view, setView] = useState<View>({ kind: 'checking' })

  const checkSession = useCallback(async () => {
    setView({ kind: 'checking' })
    try {
      await teacherApi.session()
      setView({ kind: 'swap' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setView({ kind: 'login', notice: null })
      else if (error instanceof ApiError && error.status === 404) setView({ kind: 'off' })
      else setView({ kind: 'error', message: errorMessage(error) })
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

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
          <ErrorRetry message={view.message} onRetry={() => void checkSession()} />
        </main>
      )}
      {view.kind === 'login' && <LoginScreen notice={view.notice} onLoggedIn={() => setView({ kind: 'swap' })} />}
      {view.kind === 'swap' && (
        <SwapScreen
          onLogout={() => void logout()}
          onExpired={() => setView({ kind: 'login', notice: '로그인이 만료되었습니다. 다시 로그인해 주세요.' })}
        />
      )}
    </div>
  )
}
