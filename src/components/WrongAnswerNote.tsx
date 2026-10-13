import { CATEGORY_LABELS, type WrongAnswer } from '../types/quiz'
import styles from './WrongAnswerNote.module.css'

interface Props {
  wrongAnswers: WrongAnswer[]
}

export function WrongAnswerNote({ wrongAnswers }: Props) {
  return (
    <section className={styles.note} aria-labelledby="wrong-note-title">
      <h2 id="wrong-note-title" className={styles.title}>
        오답 노트 <span className={styles.count}>{wrongAnswers.length}문제</span>
      </h2>
      {wrongAnswers.length === 0 ? (
        <p className={styles.empty}>틀린 문제가 없습니다</p>
      ) : (
        <ol className={styles.list}>
          {wrongAnswers.map((item) => (
            <li key={item.questionId} className={styles.item}>
              <p className={styles.category}>{CATEGORY_LABELS[item.category]}</p>
              <p className={styles.question}>{item.question}</p>
              <dl className={styles.answers}>
                <div className={styles.mine}>
                  <dt>
                    <span aria-hidden="true">✗ </span>내 답
                  </dt>
                  <dd>{item.chosen}</dd>
                </div>
                <div className={styles.correct}>
                  <dt>
                    <span aria-hidden="true">✓ </span>정답
                  </dt>
                  <dd>{item.correctChoice}</dd>
                </div>
              </dl>
              <p className={styles.explanation}>{item.explanation}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
