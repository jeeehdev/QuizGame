import { useEffect, useRef } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type GameResult, type WrongAnswer } from '../types/quiz'
import { formatDuration } from '../game/format'
import { WrongAnswerNote } from './WrongAnswerNote'
import styles from './ResultScreen.module.css'

interface Props {
  result: GameResult
  wrongAnswers: WrongAnswer[]
  onRestart: () => void
}

export function ResultScreen({ result, wrongAnswers, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className={styles.screen}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        {result.nickname}님의 결과
      </h1>

      <div className={styles.score}>
        <span className={styles.scoreValue}>{result.score}</span>
        <span className={styles.scoreMax}>/ {result.total * 10}점</span>
      </div>

      <dl className={styles.summary}>
        <div>
          <dt>정답 수</dt>
          <dd>
            {result.correctCount}/{result.total}
          </dd>
        </div>
        <div>
          <dt>소요 시간</dt>
          <dd>{formatDuration(result.durationSec)}</dd>
        </div>
      </dl>

      <h2 className={styles.subtitle}>카테고리별 정답</h2>
      <ul className={styles.categories}>
        {CATEGORIES.map((category) => {
          const correct = result.correctByCategory[category]
          const total = result.totalByCategory[category]
          return (
            <li key={category}>
              <span className={styles.categoryName}>{CATEGORY_LABELS[category]}</span>
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${total ? (correct / total) * 100 : 0}%` }} />
              </span>
              <strong className={styles.categoryScore}>
                {correct}/{total}
              </strong>
            </li>
          )
        })}
      </ul>

      <WrongAnswerNote wrongAnswers={wrongAnswers} />

      <button type="button" className={styles.restart} onClick={onRestart}>
        다시 하기
      </button>
    </main>
  )
}
