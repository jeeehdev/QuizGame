import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { teacherApi } from './teacherApi'
import styles from './Teacher.module.css'

interface Props {
  /** Shown above the form, e.g. after logout or when the session expired. */
  notice: string | null
  onLoggedIn: () => void
}

export function LoginScreen({ notice, onLoggedIn }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    if (password === '') {
      setError('비밀번호를 입력해 주세요.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await teacherApi.login(password)
      onLoggedIn()
    } catch (e) {
      setError(errorMessage(e))
      setSending(false)
    }
  }

  return (
    <main className={`${styles.screen} ${styles.narrow}`}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        선생님 로그인
      </h1>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label htmlFor="teacher-password" className={styles.label}>
          비밀번호
        </label>
        <input
          id="teacher-password"
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          aria-invalid={error !== null}
          aria-describedby="teacher-password-error"
        />
        <p id="teacher-password-error" className={styles.error} role="alert">
          {error ?? ''}
        </p>
        <button type="submit" className={styles.primary} disabled={sending} aria-busy={sending}>
          {sending ? '확인하는 중…' : '로그인'}
        </button>
      </form>
    </main>
  )
}
