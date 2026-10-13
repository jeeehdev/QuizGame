import { useEffect, useRef } from 'react'
import { LeaderboardTable } from './LeaderboardTable'
import styles from './LeaderboardScreen.module.css'

interface Props {
  onBack: () => void
}

export function LeaderboardScreen({ onBack }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className={styles.screen}>
      <button type="button" className={styles.back} onClick={onBack}>
        <span aria-hidden="true">←</span> 처음으로
      </button>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        순위표
      </h1>
      <p className={styles.rule}>점수가 높은 순, 같으면 더 빨리 푼 순서입니다.</p>
      <LeaderboardTable />
    </main>
  )
}
