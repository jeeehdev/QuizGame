import type { Ref } from 'react'
import styles from './FeedbackSheet.module.css'

interface Props {
  correct: boolean
  correctChoice: string
  explanation: string
  isLast: boolean
  /** Saving the result is in progress (last question only). */
  busy?: boolean
  /** Saving the result failed; the button becomes a retry. */
  error?: string | null
  onNext: () => void
  ref?: Ref<HTMLElement>
}

export function FeedbackSheet({ correct, correctChoice, explanation, isLast, busy = false, error = null, onNext, ref }: Props) {
  const label = busy ? '결과 저장 중…' : error ? '다시 시도' : isLast ? '결과 보기' : '다음 문제'
  return (
    <section ref={ref} className={`${styles.sheet} ${correct ? styles.correct : styles.wrong}`}>
      <p className={styles.verdict}>
        <span className={styles.icon} aria-hidden="true">
          {correct ? '✓' : '✗'}
        </span>
        {correct ? '정답입니다!' : '오답입니다'}
      </p>
      {!correct && <p className={styles.answer}>정답: {correctChoice}</p>}
      <p className={styles.explanation}>{explanation}</p>
      {error && (
        <p className={styles.error} role="alert">
          <span aria-hidden="true">⚠ </span>결과를 저장하지 못했습니다. {error}
        </p>
      )}
      <button type="button" className={styles.next} onClick={onNext} disabled={busy} aria-busy={busy} autoFocus>
        {label}
      </button>
    </section>
  )
}
