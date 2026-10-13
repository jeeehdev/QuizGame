import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import { formatDuration } from '../game/format'
import type { LeaderboardEntry } from '../types/quiz'
import { ErrorRetry } from './ErrorRetry'
import styles from './LeaderboardTable.module.css'

interface Props {
  /** My saved record: highlighted in the table, or shown below it when outside the top entries. */
  mine?: LeaderboardEntry
  limit?: number
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; entries: LeaderboardEntry[] }

export function LeaderboardTable({ mine, limit = 10 }: Props) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.leaderboard(limit).then(
      ({ entries }) => !cancelled && setLoad({ status: 'ok', entries }),
      (error) => !cancelled && setLoad({ status: 'error', message: errorMessage(error) }),
    )
    return () => {
      cancelled = true
    }
  }, [limit, attempt])

  function retry() {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (load.status === 'loading') {
    return (
      <p className={styles.status} role="status">
        순위표를 불러오는 중…
      </p>
    )
  }
  if (load.status === 'error') {
    return <ErrorRetry message={`순위표를 불러오지 못했습니다. ${load.message}`} onRetry={retry} />
  }
  if (load.entries.length === 0) {
    return <p className={styles.status}>아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!</p>
  }

  const mineInList = mine !== undefined && load.entries.some((e) => e.id === mine.id)
  const rows = mine && !mineInList ? [...load.entries, mine] : load.entries

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>상위 {limit}명</caption>
      <thead>
        <tr>
          <th scope="col">순위</th>
          <th scope="col">닉네임</th>
          <th scope="col">점수</th>
          <th scope="col">시간</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => {
          const isMine = entry.id === mine?.id
          const separated = isMine && !mineInList
          return (
            <tr
              key={entry.id}
              className={`${isMine ? styles.mine : ''} ${separated ? styles.separated : ''}`}
              aria-current={isMine ? 'true' : undefined}
            >
              <td className={styles.rank}>{entry.rank}</td>
              <td className={styles.nickname}>
                {entry.nickname}
                {isMine && <span className={styles.badge}>내 기록</span>}
              </td>
              <td className={styles.number}>{entry.score}</td>
              <td className={styles.number}>{formatDuration(entry.durationSec)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
