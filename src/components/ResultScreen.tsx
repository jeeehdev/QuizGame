import { CATEGORIES, CATEGORY_LABELS, type GameResult } from '../types/quiz'
import { formatDuration } from '../game/format'
import styles from './ResultScreen.module.css'

interface Props {
  result: GameResult
  onRestart: () => void
}

export function ResultScreen({ result, onRestart }: Props) {
  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>{result.nickname}님의 결과</h1>

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
        {CATEGORIES.map((category) => (
          <li key={category}>
            <span>{CATEGORY_LABELS[category]}</span>
            <strong>
              {result.correctByCategory[category]}/{result.totalByCategory[category]}
            </strong>
          </li>
        ))}
      </ul>

      <button type="button" className={styles.restart} onClick={onRestart}>
        다시 하기
      </button>
    </main>
  )
}
