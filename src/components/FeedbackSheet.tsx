import styles from './FeedbackSheet.module.css'

interface Props {
  correct: boolean
  correctChoice: string
  explanation: string
  isLast: boolean
  onNext: () => void
}

export function FeedbackSheet({ correct, correctChoice, explanation, isLast, onNext }: Props) {
  return (
    <section className={`${styles.sheet} ${correct ? styles.correct : styles.wrong}`} aria-live="polite">
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
