import { CATEGORY_LABELS, type GameState } from '../types/quiz'
import { FeedbackSheet } from './FeedbackSheet'
import styles from './QuestionScreen.module.css'

interface Props {
  state: GameState
  onAnswer: (choiceIndex: number) => void
  onNext: () => void
}

export function QuestionScreen({ state, onAnswer, onNext }: Props) {
  const question = state.questions[state.currentIndex]
  const answer = state.answers[state.currentIndex]
  const total = state.questions.length
  const number = state.currentIndex + 1
  const isLast = number === total

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

  return (
    <main className={`${styles.screen} ${answer ? styles.withSheet : ''}`}>
      <header className={styles.header}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="진행률"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={number}
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

      <h2 className={styles.question}>{question.question}</h2>

      <div className={styles.choices}>
        {question.choices.map((choice, index) => (
          <button
            key={`${question.id}-${index}`}
            type="button"
            className={choiceClass(index)}
            onClick={() => onAnswer(index)}
            disabled={answer !== undefined}
          >
            <span className={styles.choiceNumber}>{index + 1}</span>
            <span className={styles.choiceText}>{choice}</span>
            <span className={styles.choiceMark} aria-hidden="true">
              {choiceMark(index)}
            </span>
          </button>
        ))}
      </div>

      {answer && (
        <FeedbackSheet
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
