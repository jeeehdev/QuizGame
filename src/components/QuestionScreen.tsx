import { useEffect, useLayoutEffect, useRef } from 'react'
import { CATEGORY_LABELS, type GameState } from '../types/quiz'
import { FeedbackSheet } from './FeedbackSheet'
import { GameToolbar } from './GameToolbar'
import styles from './QuestionScreen.module.css'

interface Props {
  state: GameState
  soundEnabled: boolean
  onToggleSound: () => void
  onQuit: () => void
  onAnswer: (choiceIndex: number) => void
  onNext: () => void
}

export function QuestionScreen({ state, soundEnabled, onToggleSound, onQuit, onAnswer, onNext }: Props) {
  const question = state.questions[state.currentIndex]
  const answer = state.answers[state.currentIndex]
  const total = state.questions.length
  const number = state.currentIndex + 1
  const isLast = number === total
  const headingRef = useRef<HTMLHeadingElement>(null)
  const choicesRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const answered = answer !== undefined

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
  }, [answered, question.id])

  function choiceClass(index: number): string {
    if (!answer) return styles.choice
    if (index === question.answerIndex) return `${styles.choice} ${styles.correct}`
    if (index === answer.choiceIndex) return `${styles.choice} ${styles.wrong}`
    return `${styles.choice} ${styles.dimmed}`
  }

  function choiceMark(index: number): string {
    if (!answer) return ''
    if (index === question.answerIndex) return '✓'
    if (index === answer.choiceIndex) return '✗'
    return ''
  }

  function choiceLabel(index: number, choice: string): string {
    const base = `${index + 1}번, ${choice}`
    if (!answer) return base
    if (index === question.answerIndex) return `${base}, 정답${index === answer.choiceIndex ? ', 내가 고른 답' : ''}`
    if (index === answer.choiceIndex) return `${base}, 내가 고른 답, 오답`
    return base
  }

  const announcement = answer
    ? `${answer.correct ? '정답입니다.' : `오답입니다. 정답은 ${question.choices[question.answerIndex]}입니다.`} ${question.explanation}`
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
        <span className={styles.srOnly}>
          {number}번 문제.{' '}
        </span>
        {question.question}
      </h2>

      <div ref={choicesRef} className={styles.choices} role="group" aria-label="보기 (숫자 키 1~4로 선택)">
        {question.choices.map((choice, index) => (
          <button
            key={`${question.id}-${index}`}
            type="button"
            className={choiceClass(index)}
            onClick={() => onAnswer(index)}
            disabled={answer !== undefined}
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

      {/* Kept mounted so the verdict is announced when its text changes. */}
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {answer && (
        <FeedbackSheet
          ref={sheetRef}
          correct={answer.correct}
          correctChoice={question.choices[question.answerIndex]}
          explanation={question.explanation}
          isLast={isLast}
          onNext={onNext}
        />
      )}
    </main>
  )
}
