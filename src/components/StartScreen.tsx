import { useState, type FormEvent } from 'react'
import { validateNickname, NICKNAME_MAX, NICKNAME_MIN } from '../game/nickname'
import styles from './StartScreen.module.css'

interface Props {
  initialNickname: string
  onStart: (nickname: string) => void
}

export function StartScreen({ initialNickname, onStart }: Props) {
  const [nickname, setNickname] = useState(initialNickname)
  const [submitted, setSubmitted] = useState(false)
  const error = validateNickname(nickname)
  const showError = submitted && error !== null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error === null) onStart(nickname.trim())
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
          onChange={(e) => setNickname(e.target.value)}
          placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX}자, 한글·영문·숫자`}
          autoComplete="off"
          aria-invalid={showError}
          aria-describedby="nickname-error"
        />
        <p id="nickname-error" className={styles.error} role="alert">
          {showError ? error : ''}
        </p>
        <button type="submit" className={styles.start}>
          시작하기
        </button>
      </form>
    </main>
  )
}
