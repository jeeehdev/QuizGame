import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorRetry } from '../components/ErrorRetry'
import { fetchResult, teacherApi, type Loaded } from './teacherApi'
import { CATEGORIES, CATEGORY_LABELS, type Category, type Difficulty, type QuizQuestion, type TeacherQuestionsResponse } from '../types/quiz'
import styles from './Teacher.module.css'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' }

interface Props {
  /** The session ended (401); go back to the login screen. */
  onExpired: () => void
}

interface Selection {
  bankId?: string
  candidateId?: string
}

interface Pending {
  slot: string
  removed: QuizQuestion
  added: QuizQuestion
}

const slotKey = (category: Category, difficulty: Difficulty) => `${category}-${difficulty}`

/** Lists questions in play next to candidates of the same category and difficulty, and swaps a chosen pair. */
export function SwapScreen({ onExpired }: Props) {
  const [data, setData] = useState<TeacherQuestionsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Record<string, Selection>>({})
  const [onlyWithCandidates, setOnlyWithCandidates] = useState(true)
  const [pending, setPending] = useState<Pending | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  const handleError = useCallback(
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
    (result: Loaded<TeacherQuestionsResponse>) => {
      if ('data' in result) {
        setData(result.data)
        setLoadError(null)
        return
      }
      const message = handleError(result.error)
      if (message) setLoadError(message)
    },
    [handleError],
  )
  const load = useCallback(() => fetchResult(teacherApi.questions).then(apply), [apply])

  useEffect(() => {
    headingRef.current?.focus()
    let active = true
    void fetchResult(teacherApi.questions).then((result) => active && apply(result))
    return () => {
      active = false
    }
  }, [apply])

  function select(slot: string, change: Selection) {
    setSelection((current) => ({ ...current, [slot]: { ...current[slot], ...change } }))
  }

  async function confirmSwap() {
    if (!pending || swapping) return
    const { slot, removed, added } = pending
    setPending(null)
    setSwapping(true)
    try {
      const result = await teacherApi.swap({ bankId: removed.id, candidateId: added.id })
      setData({ bank: result.bank, candidates: result.candidates })
      setSelection((current) => ({ ...current, [slot]: {} }))
      setStatus({
        text: `${result.removed.id}를 빼고 ${result.added.id}를 넣었습니다. 새로 시작하는 게임부터 바뀐 문제가 나옵니다.`,
        error: false,
      })
    } catch (error) {
      const message = handleError(error)
      if (message === null) return
      setStatus({ text: `바꾸지 못했습니다. ${message}`, error: true })
    } finally {
      setSwapping(false)
    }
    // The pressed button is now disabled, so move focus to the result instead of losing it.
    requestAnimationFrame(() => statusRef.current?.focus())
  }

  const slots = CATEGORIES.flatMap((category) =>
    DIFFICULTIES.map((difficulty) => {
      const inSlot = (q: QuizQuestion) => q.category === category && q.difficulty === difficulty
      return {
        key: slotKey(category, difficulty),
        category,
        difficulty,
        bank: data?.bank.filter(inSlot) ?? [],
        candidates: data?.candidates.filter(inSlot) ?? [],
      }
    }),
  )
  const visibleSlots = onlyWithCandidates ? slots.filter((s) => s.candidates.length > 0) : slots

  return (
    <main className={styles.screen}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        문제 교체
      </h1>
      <p className={styles.help}>
        출제 문제 하나와 같은 카테고리·난이도의 후보 문제 하나를 골라 바꿉니다. 바꾸면 바로 새 게임에 반영되고, 이미 시작한
        게임은 원래 문제로 끝납니다.
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
      {!data && !loadError && <p className={styles.status}>문제를 불러오는 중…</p>}

      {data && (
        <>
          <label className={styles.toggle}>
            <input type="checkbox" checked={onlyWithCandidates} onChange={(e) => setOnlyWithCandidates(e.target.checked)} />
            후보가 있는 칸만 보기
          </label>
          <p className={styles.help}>
            출제 문제 {data.bank.length}개 · 후보 문제 {data.candidates.length}개
          </p>

          {visibleSlots.length === 0 && (
            <p className={styles.empty}>
              후보 문제가 없습니다. Claude Code에서 <code>/quiz-add &lt;카테고리&gt; &lt;난이도&gt;</code>로 후보를 추가하면 여기에
              나타납니다.
            </p>
          )}

          {CATEGORIES.map((category) => {
            const categorySlots = visibleSlots.filter((s) => s.category === category)
            if (categorySlots.length === 0) return null
            return (
              <section key={category} className={styles.category} aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className={styles.categoryTitle}>
                  {CATEGORY_LABELS[category]}
                </h2>
                {categorySlots.map((slot) => {
                  const chosen = selection[slot.key] ?? {}
                  const removed = slot.bank.find((q) => q.id === chosen.bankId)
                  const added = slot.candidates.find((q) => q.id === chosen.candidateId)
                  const label = `${CATEGORY_LABELS[slot.category]} ${DIFFICULTY_LABELS[slot.difficulty]}`
                  return (
                    <section key={slot.key} className={styles.slot} aria-labelledby={`slot-${slot.key}`}>
                      <h3 id={`slot-${slot.key}`} className={styles.slotTitle}>
                        {DIFFICULTY_LABELS[slot.difficulty]}{' '}
                        <span className={styles.count}>
                          (출제 {slot.bank.length} · 후보 {slot.candidates.length})
                        </span>
                      </h3>
                      <div className={styles.columns}>
                        <QuestionChoices
                          slotLabel={label}
                          kind="출제 문제"
                          name={`bank-${slot.key}`}
                          questions={slot.bank}
                          selectedId={chosen.bankId}
                          onSelect={(bankId) => select(slot.key, { bankId })}
                        />
                        {slot.candidates.length > 0 ? (
                          <QuestionChoices
                            slotLabel={label}
                            kind="후보 문제"
                            name={`cand-${slot.key}`}
                            questions={slot.candidates}
                            selectedId={chosen.candidateId}
                            onSelect={(candidateId) => select(slot.key, { candidateId })}
                          />
                        ) : (
                          <p className={styles.empty}>후보 없음</p>
                        )}
                      </div>
                      {slot.candidates.length > 0 && (
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={!removed || !added || swapping}
                          onClick={() => removed && added && setPending({ slot: slot.key, removed, added })}
                        >
                          {removed && added ? `${removed.id} ↔ ${added.id} 바꾸기` : '출제 문제와 후보를 하나씩 고르세요'}
                        </button>
                      )}
                    </section>
                  )
                })}
              </section>
            )
          })}
        </>
      )}

      {pending && (
        <ConfirmDialog
          title="문제를 바꿀까요?"
          message={`출제 문제 ${pending.removed.id} 「${pending.removed.question}」을 빼고, 후보 ${pending.added.id} 「${pending.added.question}」을 넣습니다. 뺀 문제는 후보로 옮겨집니다.`}
          confirmLabel="바꾸기"
          cancelLabel="취소"
          onConfirm={() => void confirmSwap()}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  )
}

interface QuestionChoicesProps {
  /** e.g. "지리 쉬움"; read by screen readers before the visible legend. */
  slotLabel: string
  kind: '출제 문제' | '후보 문제'
  name: string
  questions: QuizQuestion[]
  selectedId: string | undefined
  onSelect: (id: string) => void
}

function QuestionChoices({ slotLabel, kind, name, questions, selectedId, onSelect }: QuestionChoicesProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        <span className={styles.srOnly}>{slotLabel}</span> {kind}
      </legend>
      {questions.map((q) => (
        <div key={q.id} className={`${styles.option} ${q.id === selectedId ? styles.selected : ''}`}>
          <label className={styles.optionLabel}>
            <input type="radio" name={name} value={q.id} checked={q.id === selectedId} onChange={() => onSelect(q.id)} />
            <span>
              <span className={styles.qid}>{q.id}</span> {q.question}
            </span>
          </label>
          <ol className={styles.choices}>
            {q.choices.map((choice, i) => (
              <li key={i} className={i === q.answerIndex ? styles.answer : undefined}>
                {choice}
                {i === q.answerIndex && <span className={styles.answerMark}> ✓ 정답</span>}
              </li>
            ))}
          </ol>
          <details className={styles.explanation}>
            <summary>해설</summary>
            {q.explanation}
          </details>
        </div>
      ))}
    </fieldset>
  )
}
