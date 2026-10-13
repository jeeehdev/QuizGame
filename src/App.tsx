import { useReducer } from 'react'
import { QuestionScreen } from './components/QuestionScreen'
import { ResultScreen } from './components/ResultScreen'
import { StartScreen } from './components/StartScreen'
import rawQuestions from './data/questions.json'
import { loadQuestions } from './data/validateQuestions'
import { createGame, getResult } from './game/game'
import { gameReducer, initialAppState } from './game/reducer'
import type { Question } from './types/quiz'
import styles from './App.module.css'

let questions: Question[] = []
let loadError: string | null = null
try {
  questions = loadQuestions(rawQuestions)
} catch (error) {
  loadError = error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialAppState)

  if (loadError) {
    return (
      <div className={styles.app}>
        <main className={styles.error}>
          <h1>문제를 불러오지 못했습니다</h1>
          <pre>{loadError}</pre>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      {state.phase === 'start' && (
        <StartScreen
          initialNickname={state.nickname}
          onStart={(nickname) => dispatch({ type: 'start', game: createGame(questions, nickname) })}
        />
      )}
      {state.phase === 'playing' && (
        <QuestionScreen
          state={state}
          onAnswer={(choiceIndex) => dispatch({ type: 'answer', choiceIndex, at: Date.now() })}
          onNext={() => dispatch({ type: 'next' })}
        />
      )}
      {state.phase === 'result' && (
        <ResultScreen result={getResult(state)} onRestart={() => dispatch({ type: 'restart' })} />
      )}
    </div>
  )
}
