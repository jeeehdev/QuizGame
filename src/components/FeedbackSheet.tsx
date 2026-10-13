import type { Ref } from 'react'
import styles from './FeedbackSheet.module.css'

interface Props {
  correct: boolean
  correctChoice: string
  explanation: string
  isLast: boolean
  onNext: () => void
  ref?: Ref<HTMLElement>
}

export function FeedbackSheet({ correct, correctChoice, explanation, isLast, onNext, ref }: Props) {
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
      <button type="button" className={styles.next} onClick={onNext} autoFocus>
        {isLast ? '결과 보기' : '다음 문제'}
      </button>
    </section>
  )
}
