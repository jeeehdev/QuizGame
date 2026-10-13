import { useEffect, useReducer, useState } from 'react'
import { CategoryIntro } from './components/CategoryIntro'
import { ConfirmDialog } from './components/ConfirmDialog'
import { QuestionScreen } from './components/QuestionScreen'
import { ResultScreen } from './components/ResultScreen'
import { StartScreen } from './components/StartScreen'
import rawQuestions from './data/questions.json'
import { loadQuestions } from './data/validateQuestions'
import { CATEGORY_INTRO_MS, createGame, getResult, getWrongAnswers, isCurrentAnswered } from './game/game'
import { keyToCommand } from './game/keyboard'
import { gameReducer, initialAppState } from './game/reducer'
import { loadSoundEnabled, playSound, preloadSounds, saveSoundEnabled } from './game/sound'
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
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled)
  const [confirmingQuit, setConfirmingQuit] = useState(false)

  const playing = state.phase === 'playing'
  const showingIntro = playing && state.showingIntro
  const currentIndex = playing ? state.currentIndex : -1

  useEffect(preloadSounds, [])

  // Show each category intro for one second, then reveal the question.
  useEffect(() => {
    if (!showingIntro) return
    const timer = setTimeout(() => dispatch({ type: 'endIntro', at: Date.now() }), CATEGORY_INTRO_MS)
    return () => clearTimeout(timer)
  }, [showingIntro, currentIndex])

  // Leaving mid-game: closing the tab gets the browser's own warning; the back button opens our dialog.
  useEffect(() => {
    if (!playing) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    const onPopState = () => {
      history.pushState({ quiz: true }, '')
      setConfirmingQuit(true)
    }
    history.pushState({ quiz: true }, '')
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
  }, [playing])

  function answer(choiceIndex: number) {
    if (state.phase !== 'playing' || state.showingIntro || isCurrentAnswered(state)) return
    const correct = choiceIndex === state.questions[state.currentIndex].answerIndex
    if (soundEnabled) playSound(correct ? 'correct' : 'wrong')
    dispatch({ type: 'answer', choiceIndex, at: Date.now() })
  }

  function next() {
    dispatch({ type: 'next', at: Date.now() })
  }

  useEffect(() => {
    if (state.phase !== 'playing') return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const command = keyToCommand(event, {
        answered: isCurrentAnswered(state),
        choiceCount: state.questions[state.currentIndex].choices.length,
        blocked: state.showingIntro || confirmingQuit,
        focusOnControl: target?.closest('button, input, textarea, select, a') != null,
      })
      if (!command) return
      event.preventDefault()
      if (command.type === 'answer') answer(command.choiceIndex)
      else next()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function toggleSound() {
    setSoundEnabled((enabled) => {
      saveSoundEnabled(!enabled)
      return !enabled
    })
  }

  function confirmQuit() {
    setConfirmingQuit(false)
    dispatch({ type: 'quit' })
  }

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
      {/* While the quit dialog is open, the game behind it is inert (not focusable or read). */}
      <div inert={confirmingQuit}>
        {state.phase === 'start' && (
          <StartScreen
            initialNickname={state.nickname}
            onStart={(nickname) => dispatch({ type: 'start', game: createGame(questions, nickname) })}
          />
        )}
        {state.phase === 'playing' &&
          (state.showingIntro ? (
            <CategoryIntro
              category={state.questions[state.currentIndex].category}
              questionCount={state.questions.filter((q) => q.category === state.questions[state.currentIndex].category).length}
            />
          ) : (
            <QuestionScreen
              state={state}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              onQuit={() => setConfirmingQuit(true)}
              onAnswer={answer}
              onNext={next}
            />
          ))}
        {state.phase === 'result' && (
          <ResultScreen
            result={getResult(state)}
            wrongAnswers={getWrongAnswers(state)}
            onRestart={() => dispatch({ type: 'restart' })}
          />
        )}
      </div>
      {playing && confirmingQuit && (
        <ConfirmDialog
          title="게임을 그만둘까요?"
          message="지금까지 푼 기록은 저장되지 않고 결과에도 남지 않습니다."
          confirmLabel="그만두기"
          cancelLabel="계속 풀기"
          onConfirm={confirmQuit}
          onCancel={() => setConfirmingQuit(false)}
        />
      )}
    </div>
  )
}
