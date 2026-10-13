import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorRetry } from '../components/ErrorRetry'
import type { RosterResponse, RosterStudent, UnmatchedNickname } from '../types/quiz'
import { fetchResult, teacherApi } from './teacherApi'
import styles from './Teacher.module.css'

interface Props {
  /** The session ended (401); go back to the login screen. */
  onExpired: () => void
}

const local = (iso: string) => new Date(iso).toLocaleString('sv-SE').slice(0, 16)

const fetchRoster = () => fetchResult(() => Promise.all([teacherApi.roster(), teacherApi.unmatchedNicknames()]))

/** Class roster: students, the nicknames they play under, and nicknames not yet linked to anyone. */
export function RosterScreen({ onExpired }: Props) {
  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [unmatched, setUnmatched] = useState<UnmatchedNickname[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [className, setClassName] = useState('')
  const [form, setForm] = useState({ number: '', name: '', nicknames: '' })
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState<RosterStudent | null>(null)
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

  /** Puts a loaded roster into state. Returns false when loading failed. */
  const apply = useCallback(
    (result: Awaited<ReturnType<typeof fetchRoster>>) => {
      if ('error' in result) {
        const message = messageFor(result.error)
        if (message) setLoadError(message)
        return false
      }
      const [nextRoster, nextUnmatched] = result.data
      setLoadError(null)
      setRoster(nextRoster)
      setClassName(nextRoster.className)
      setUnmatched(nextUnmatched.nicknames)
      return true
    },
    [messageFor],
  )
  const load = useCallback(() => fetchRoster().then(apply), [apply])

  useEffect(() => {
    headingRef.current?.focus()
    let active = true
    void fetchRoster().then((result) => active && apply(result))
    return () => {
      active = false
    }
  }, [apply])

  /** Runs one change, reloads both lists, and announces the result where focus can land. */
  async function change(run: () => Promise<unknown>, done: string) {
    if (busy) return false
    setBusy(true)
    let ok = false
    try {
      await run()
      ok = true
      if (await load()) setStatus({ text: done, error: false })
    } catch (error) {
      const message = messageFor(error)
      if (message === null) return false
      setStatus({ text: message, error: true })
    } finally {
      setBusy(false)
    }
    requestAnimationFrame(() => statusRef.current?.focus())
    return ok
  }

  async function saveClassName(event: FormEvent) {
    event.preventDefault()
    await change(() => teacherApi.setClassName(className), `반 이름을 "${className.trim()}"(으)로 저장했습니다.`)
  }

  async function addStudent(event: FormEvent) {
    event.preventDefault()
    const nicknames = form.nicknames
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    const ok = await change(
      () => teacherApi.addStudent({ number: Number(form.number), name: form.name, nicknames }),
      `${form.number}번 ${form.name.trim()} 학생을 추가했습니다.`,
    )
    if (ok) setForm({ number: '', name: '', nicknames: '' })
  }

  async function confirmRemove() {
    if (!removing) return
    const student = removing
    setRemoving(null)
    await change(
      () => teacherApi.removeStudent(student.id),
      `${student.number}번 ${student.name} 학생을 명단에서 뺐습니다. 기록은 그대로 남습니다.`,
    )
  }

  const studentLabel = (id: number) => {
    const s = roster?.students.find((x) => x.id === id)
    return s ? `${s.number}번 ${s.name}` : ''
  }

  return (
    <main className={styles.screen}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        학생 명단
      </h1>
      <p className={styles.help}>
        게임은 닉네임만 받으므로, 학생마다 쓰는 닉네임을 연결해야 성적에 반영됩니다. 학생을 명단에서 빼도 기록은 지워지지
        않습니다.
      </p>
      <p ref={statusRef} tabIndex={-1} className={status?.error ? styles.error : styles.success} role="status">
        {status?.text ?? ''}
      </p>

      {loadError && (
        <ErrorRetry
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            void load()
          }}
        />
      )}
      {!roster && !loadError && <p className={styles.status}>명단을 불러오는 중…</p>}

      {roster && (
        <>
          <form className={styles.inlineForm} onSubmit={(e) => void saveClassName(e)}>
            <label htmlFor="class-name" className={styles.label}>
              반 이름
            </label>
            <input
              id="class-name"
              className={styles.input}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="예: 3학년 2반"
            />
            <button type="submit" className={styles.secondary} disabled={busy}>
              저장
            </button>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.caption}>학생 {roster.students.length}명</caption>
              <thead>
                <tr>
                  <th scope="col">번호</th>
                  <th scope="col">이름</th>
                  <th scope="col">닉네임</th>
                  <th scope="col">기록</th>
                  <th scope="col">
                    <span className={styles.srOnly}>관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.students.length === 0 && (
                  <tr>
                    <td colSpan={5}>아직 학생이 없습니다. 아래에서 추가하세요.</td>
                  </tr>
                )}
                {roster.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.number}</td>
                    <th scope="row">{s.name}</th>
                    <td>
                      {s.nicknames.length === 0 && <span className={styles.muted}>없음</span>}
                      <ul className={styles.chips}>
                        {s.nicknames.map((n) => (
                          <li key={n} className={styles.chip}>
                            {n}
                            <button
                              type="button"
                              className={styles.chipButton}
                              aria-label={`닉네임 ${n} 연결 해제`}
                              disabled={busy}
                              onClick={() => void change(() => teacherApi.unlinkNickname(n), `닉네임 ${n}의 연결을 해제했습니다.`)}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>{s.playCount > 0 ? `${s.playCount}건` : <span className={styles.muted}>미응시</span>}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.secondary}
                        aria-label={`${s.number}번 ${s.name} 명단에서 빼기`}
                        disabled={busy}
                        onClick={() => setRemoving(s)}
                      >
                        빼기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className={styles.panel} aria-labelledby="add-student">
            <h2 id="add-student" className={styles.panelTitle}>
              학생 추가
            </h2>
            <form className={styles.addForm} onSubmit={(e) => void addStudent(e)}>
              <label className={styles.field}>
                <span className={styles.label}>번호</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>이름</span>
                <input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>닉네임 (쉼표로 구분, 생략 가능)</span>
                <input
                  className={styles.input}
                  value={form.nicknames}
                  onChange={(e) => setForm({ ...form, nicknames: e.target.value })}
                />
              </label>
              <button type="submit" className={styles.primary} disabled={busy}>
                추가
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-labelledby="unmatched">
            <h2 id="unmatched" className={styles.panelTitle}>
              명단에 없는 닉네임 ({unmatched.length})
            </h2>
            {unmatched.length === 0 ? (
              <p className={styles.muted}>모든 기록이 명단의 학생에게 연결되어 있습니다.</p>
            ) : (
              <ul className={styles.unmatchedList}>
                {unmatched.map((n) => {
                  const chosen = linkTarget[n.nickname] ?? (n.similarStudentIds.length === 1 ? String(n.similarStudentIds[0]) : '')
                  const selectId = `link-${n.nickname}`
                  return (
                    <li key={n.nickname} className={styles.unmatched}>
                      <div>
                        <strong>{n.nickname}</strong>{' '}
                        <span className={styles.muted}>
                          기록 {n.playCount}건 · 최고 {n.bestScore}점 · 마지막 {local(n.lastPlayedAt)}
                        </span>
                        {n.similarStudentIds.length > 0 && (
                          <p className={styles.hint}>
                            확인 필요: {n.similarStudentIds.map(studentLabel).join(', ')}와 비슷합니다.
                          </p>
                        )}
                      </div>
                      <div className={styles.linkRow}>
                        <label htmlFor={selectId} className={styles.srOnly}>
                          {n.nickname}를 연결할 학생
                        </label>
                        <select
                          id={selectId}
                          className={styles.select}
                          value={chosen}
                          onChange={(e) => setLinkTarget({ ...linkTarget, [n.nickname]: e.target.value })}
                        >
                          <option value="">학생 선택</option>
                          {roster.students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.number}번 {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={busy || chosen === ''}
                          onClick={() =>
                            void change(
                              () => teacherApi.linkNickname(Number(chosen), n.nickname),
                              `닉네임 ${n.nickname}을(를) ${studentLabel(Number(chosen))} 학생에게 연결했습니다.`,
                            )
                          }
                        >
                          연결
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="명단에서 뺄까요?"
          message={`${removing.number}번 ${removing.name} 학생과 연결된 닉네임(${removing.nicknames.join(', ') || '없음'})을 명단에서 뺍니다. 순위표 기록은 지워지지 않습니다.`}
          confirmLabel="빼기"
          cancelLabel="취소"
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </main>
  )
}
