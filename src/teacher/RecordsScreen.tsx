import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorRetry } from '../components/ErrorRetry'
import type { TeacherScoreEntry, TeacherScoresResponse } from '../types/quiz'
import { duration, localTime } from './format'
import { fetchResult, teacherApi, type Loaded } from './teacherApi'
import styles from './Teacher.module.css'

interface Props {
  /** The session ended (401); go back to the login screen. */
  onExpired: () => void
}

interface Search {
  query: string
  fast: boolean
}

const recordLabel = (e: TeacherScoreEntry) =>
  `#${e.id} ${e.nickname}${e.student ? `(${e.student.number}번 ${e.student.name})` : ''} ${e.score}점`

/** 기록 관리: find saved records and delete one (it leaves the leaderboard and every teacher report). */
export function RecordsScreen({ onExpired }: Props) {
  const [form, setForm] = useState<Search>({ query: '', fast: false })
  const [search, setSearch] = useState<Search>({ query: '', fast: false })
  const [data, setData] = useState<TeacherScoresResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [deleting, setDeleting] = useState<TeacherScoreEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  /** Returns the message to show, or null after sending the teacher back to login. */
  const messageFor = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        onExpired()
        return null
      }
      return errorMessage(error)
    },
    [onExpired],
  )

  const apply = useCallback(
    (result: Loaded<TeacherScoresResponse>) => {
      if ('data' in result) {
        setData(result.data)
        setLoadError(null)
        return true
      }
      const message = messageFor(result.error)
      if (message) setLoadError(message)
      return false
    },
    [messageFor],
  )
  const fetchScores = (s: Search) => fetchResult(() => teacherApi.scores(s.query, s.fast))

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    void fetchResult(() => teacherApi.scores(search.query, search.fast)).then((result) => active && apply(result))
    return () => {
      active = false
    }
  }, [search, apply])

  function find(event: FormEvent) {
    event.preventDefault()
    setStatus(null)
    setSearch({ query: form.query.trim(), fast: form.fast })
  }

  async function confirmDelete() {
    if (!deleting || busy) return
    const entry = deleting
    setDeleting(null)
    setBusy(true)
    try {
      await teacherApi.deleteScore(entry.id)
      await fetchScores(search).then(apply)
      setStatus({ text: `기록 ${recordLabel(entry)}을(를) 지웠습니다.`, error: false })
    } catch (error) {
      const message = messageFor(error)
      if (message === null) return
      setStatus({ text: message, error: true })
      await fetchScores(search).then(apply)
    } finally {
      setBusy(false)
    }
    requestAnimationFrame(() => statusRef.current?.focus())
  }

  return (
    <main className={styles.screen}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        기록 관리
      </h1>
      <p className={styles.help}>
        잘못 저장되었거나 장난으로 남긴 기록을 지웁니다. 지운 기록은 순위표와 성적 화면에서 빠지고, 그 기록의 문제별 답안도 함께
        지워집니다. 되돌릴 수 없습니다.
      </p>

      <form className={styles.inlineForm} onSubmit={find} role="search" aria-label="기록 찾기">
        <label htmlFor="records-query" className={styles.label}>
          닉네임 또는 학생 이름
        </label>
        <input
          id="records-query"
          className={styles.input}
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
        />
        <label className={styles.toggle}>
          <input type="checkbox" checked={form.fast} onChange={(e) => setForm({ ...form, fast: e.target.checked })} />
          빠른 기록(⏱️ 80초 미만)만
        </label>
        <button type="submit" className={styles.secondary}>
          찾기
        </button>
      </form>

      <p ref={statusRef} tabIndex={-1} className={status?.error ? styles.error : styles.success} role="status">
        {status?.text ?? ''}
      </p>

      {loadError && (
        <ErrorRetry
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            void fetchScores(search).then(apply)
          }}
        />
      )}
      {!data && !loadError && <p className={styles.status}>기록을 불러오는 중…</p>}

      {data && (
        <div className={styles.tableWrap} role="region" aria-labelledby="records-caption" tabIndex={0}>
          <table className={styles.reportTable}>
            <caption id="records-caption" className={styles.caption}>
              {data.total === 0
                ? '찾은 기록이 없습니다'
                : `기록 ${data.total}건${data.total > data.entries.length ? ` 중 최근 ${data.entries.length}건` : ''} (최신 순)`}
            </caption>
            <thead>
              <tr>
                <th scope="col">id</th>
                <th scope="col">닉네임</th>
                <th scope="col">학생</th>
                <th scope="col">점수</th>
                <th scope="col">소요 시간</th>
                <th scope="col">플레이 시각</th>
                <th scope="col">
                  <span className={styles.srOnly}>삭제</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className={styles.qid}>{e.id}</td>
                  <th scope="row">{e.nickname}</th>
                  <td>{e.student ? `${e.student.number} ${e.student.name}` : <span className={styles.muted}>미등록</span>}</td>
                  <td>{e.score}</td>
                  <td>
                    {duration(e.durationSec)}
                    {e.fast && (
                      <>
                        {' '}
                        <span aria-hidden="true">⏱️</span>
                        <span className={styles.srOnly}>(빠른 기록)</span>
                      </>
                    )}
                  </td>
                  <td>{localTime(e.playedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.secondary}
                      aria-label={`기록 ${recordLabel(e)} 지우기`}
                      disabled={busy}
                      onClick={() => setDeleting(e)}
                    >
                      지우기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="기록을 지울까요?"
          message={`${recordLabel(deleting)} · ${localTime(deleting.playedAt)} 기록과 문제별 답안을 지웁니다. 순위표와 성적 화면에서도 빠지고, 되돌릴 수 없습니다.`}
          confirmLabel="지우기"
          cancelLabel="취소"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  )
}
