import { useState, type FormEvent } from 'react'
import { NICKNAME_MAX, NICKNAME_MIN, validateNickname } from '../../shared/nickname.ts'
import styles from './StartScreen.module.css'

interface Props {
  initialNickname: string
  /** True while the game is being created on the server. */
  starting: boolean
  /** Error from the server (e.g. a banned word or a network failure). */
  serverError: string | null
  onStart: (nickname: string) => void
  onShowLeaderboard: () => void
}

export function StartScreen({ initialNickname, starting, serverError, onStart, onShowLeaderboard }: Props) {
  const [nickname, setNickname] = useState(initialNickname)
  const [submitted, setSubmitted] = useState(false)
  // A server error belongs to the nickname it was about; editing the field clears it.
  const [editedSinceError, setEditedSinceError] = useState(false)
  const error = validateNickname(nickname)
  const message = submitted && error !== null ? error : !editedSinceError ? serverError : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setEditedSinceError(false)
    if (error === null && !starting) onStart(nickname.trim())
  }

  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>상식 퀴즈</h1>
      <ul className={styles.rules}>
        <li>
          <strong>4개</strong> 카테고리
        </li>
        <li>
          <strong>40</strong>문제
        </li>
        <li>
          <strong>400</strong>점 만점
        </li>
      </ul>
      <p className={styles.order}>한국사 → 과학 → 지리 → 예술과 문화 순서로 출제되고, 한 문제에 10점입니다.</p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label htmlFor="nickname" className={styles.label}>
          닉네임
        </label>
        <input
          id="nickname"
          className={styles.input}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value)
            setEditedSinceError(true)
          }}
          placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX}자, 한글·영문·숫자`}
          autoComplete="off"
          aria-invalid={message !== null}
          aria-describedby="nickname-error"
        />
        <p id="nickname-error" className={styles.error} role="alert">
          {message ?? ''}
        </p>
        <button type="submit" className={styles.start} disabled={starting} aria-busy={starting}>
          {starting ? '준비하는 중…' : '시작하기'}
        </button>
      </form>

      <button type="button" className={styles.leaderboard} onClick={onShowLeaderboard} disabled={starting}>
        순위표 보기
      </button>

      <a className={styles.teacherLink} href="/teacher">
        선생님
      </a>
    </main>
  )
}
