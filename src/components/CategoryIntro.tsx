import { CATEGORIES, CATEGORY_LABELS, type Category } from '../types/quiz'
import styles from './CategoryIntro.module.css'

interface Props {
  category: Category
  questionCount: number
}

export function CategoryIntro({ category, questionCount }: Props) {
  const order = CATEGORIES.indexOf(category) + 1
  return (
    <main className={styles.screen}>
      <h1 className={styles.srOnly}>상식 퀴즈</h1>
      <div className={styles.card} role="status">
        <p className={styles.step}>
          카테고리 {order}/{CATEGORIES.length}
        </p>
        <h2 className={styles.title}>
          {CATEGORY_LABELS[category]} — {questionCount}문제
        </h2>
      </div>
    </main>
  )
}
