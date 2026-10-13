import { useEffect, useLayoutEffect, useRef } from 'react'
import { isLastQuestion, type PlayingState } from '../game/reducer'
import { CATEGORY_LABELS } from '../types/quiz'
import { ErrorRetry } from './ErrorRetry'
import { FeedbackSheet } from './FeedbackSheet'
import { GameToolbar } from './GameToolbar'
import styles from './QuestionScreen.module.css'

interface Props {
  state: PlayingState
  soundEnabled: boolean
  onToggleSound: () => void
  onQuit: () => void
  onAnswer: (choiceIndex: number) => void
  onNext: () => void
  onFinish: () => void
}

export function QuestionScreen({ state, soundEnabled, onToggleSound, onQuit, onAnswer, onNext, onFinish }: Props) {
  const question = state.questions[state.currentIndex]
  const reveal = state.reveals[state.currentIndex]
  const total = state.questions.length
  const number = state.currentIndex + 1
  const isLast = isLastQuestion(state)
  const pending = state.pendingChoice
  const answerError = !reveal && pending !== null ? state.error : null
  const headingRef = useRef<HTMLHeadingElement>(null)
  const choicesRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const answered = reveal !== undefined

  // Each new question moves focus to its text so screen readers start there.
  useEffect(() => {
    headingRef.current?.focus()
  }, [question.id])

  // The feedback sheet is fixed to the bottom; reserve its height and scroll so no choice is hidden under it.
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (!answered) {
      main.style.paddingBottom = ''
      return
    }
    const height = sheetRef.current?.offsetHeight ?? 0
    main.style.paddingBottom = `${height + 24}px`
    const choicesBottom = choicesRef.current?.getBoundingClientRect().bottom ?? 0
    const hiddenBy = choicesBottom - (window.innerHeight - height - 12)
    if (hiddenBy > 0) window.scrollBy({ top: hiddenBy, behavior: 'instant' })
  }, [answered, question.id, state.error])

  function choiceClass(index: number): string {
    if (!reveal) return index === pending ? `${styles.choice} ${styles.pending}` : styles.choice
    if (index === reveal.answerIndex) return `${styles.choice} ${styles.correct}`
    if (index === reveal.choiceIndex) return `${styles.choice} ${styles.wrong}`
    return `${styles.choice} ${styles.dimmed}`
  }

  function choiceMark(index: number): string {
    if (!reveal) return ''
    if (index === reveal.answerIndex) return '✓'
    if (index === reveal.choiceIndex) return '✗'
    return ''
  }

  function choiceLabel(index: number, choice: string): string {
    const base = `${index + 1}번, ${choice}`
    if (!reveal) return index === pending ? `${base}, 선택함` : base
    if (index === reveal.answerIndex) return `${base}, 정답${index === reveal.choiceIndex ? ', 내가 고른 답' : ''}`
    if (index === reveal.choiceIndex) return `${base}, 내가 고른 답, 오답`
    return base
  }

  const announcement = reveal
    ? `${reveal.correct ? '정답입니다.' : `오답입니다. 정답은 ${question.choices[reveal.answerIndex]}입니다.`} ${reveal.explanation}`
    : ''

  return (
    <main ref={mainRef} className={styles.screen}>
      <h1 className={styles.srOnly}>상식 퀴즈</h1>
      <GameToolbar soundEnabled={soundEnabled} onToggleSound={onToggleSound} onQuit={onQuit} />
      <header className={styles.header}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="진행률"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={number}
          aria-valuetext={`${total}문제 중 ${number}번째`}
        >
          <div className={styles.progressFill} style={{ width: `${(number / total) * 100}%` }} />
        </div>
        <div className={styles.meta}>
          <span className={styles.category}>{CATEGORY_LABELS[question.category]}</span>
          <span className={styles.number}>
            {number}/{total}
          </span>
          <span className={styles.score}>{state.score}점</span>
        </div>
      </header>

      <h2 ref={headingRef} tabIndex={-1} className={styles.question}>
        <span className={styles.srOnly}>{number}번 문제. </span>
        {question.question}
      </h2>

      <div
        ref={choicesRef}
        className={styles.choices}
        role="group"
        aria-label="보기 (숫자 키 1~4로 선택)"
        aria-busy={pending !== null && !answerError}
      >
        {question.choices.map((choice, index) => (
          <button
            key={`${question.id}-${index}`}
            type="button"
            className={choiceClass(index)}
            onClick={() => onAnswer(index)}
            // Locked once answered; while a request is pending only the chosen one stays enabled (for retry).
            disabled={answered || (pending !== null && index !== pending)}
            aria-pressed={!answered && index === pending ? true : undefined}
            aria-label={choiceLabel(index, choice)}
          >
            <span className={styles.choiceNumber} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.choiceText}>{choice}</span>
            <span className={styles.choiceMark} aria-hidden="true">
              {choiceMark(index)}
            </span>
          </button>
        ))}
      </div>

      {answerError && pending !== null && (
        <ErrorRetry message={`답안을 보내지 못했습니다. ${answerError}`} onRetry={() => onAnswer(pending)} />
      )}

      {/* Kept mounted so the verdict is announced when its text changes. */}
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {reveal && (
        <FeedbackSheet
          ref={sheetRef}
          correct={reveal.correct}
          correctChoice={question.choices[reveal.answerIndex]}
          explanation={reveal.explanation}
          isLast={isLast}
          busy={state.finishing}
          error={isLast ? state.error : null}
          onNext={isLast ? onFinish : onNext}
        />
      )}
    </main>
  )
}
