import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { api, errorMessage } from './api/client'
import { CategoryIntro } from './components/CategoryIntro'
import { ConfirmDialog } from './components/ConfirmDialog'
import { LeaderboardScreen } from './components/LeaderboardScreen'
import { QuestionScreen } from './components/QuestionScreen'
import { ResultScreen } from './components/ResultScreen'
import { StartScreen } from './components/StartScreen'
import { keyToCommand } from './game/keyboard'
import {
  canSendAnswer,
  gameReducer,
  getWrongAnswers,
  initialAppState,
  isAnswered,
  isLastQuestion,
} from './game/reducer'
import { loadSoundEnabled, playSound, preloadSounds, saveSoundEnabled } from './game/sound'
import { CATEGORY_INTRO_MS } from './types/quiz'
import styles from './App.module.css'

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
    const timer = setTimeout(() => dispatch({ type: 'endIntro' }), CATEGORY_INTRO_MS)
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

  async function start(nickname: string) {
    dispatch({ type: 'startRequested', nickname })
    try {
      dispatch({ type: 'gameCreated', game: await api.createGame(nickname) })
    } catch (error) {
      dispatch({ type: 'startFailed', message: errorMessage(error) })
    }
  }

  // The chosen button shows as pressed right away; feedback appears when the server's verdict arrives.
  // After a failure the same choice can be sent again (the server returns the original verdict for a repeat).
  async function answer(choiceIndex: number) {
    if (state.phase !== 'playing' || !canSendAnswer(state, choiceIndex)) return
    const { gameId, currentIndex: index } = state
    dispatch({ type: 'answerRequested', gameId, choiceIndex })
    try {
      const response = await api.answer(gameId, { questionId: state.questions[index].id, choiceIndex })
      if (soundEnabled) playSound(response.correct ? 'correct' : 'wrong')
      dispatch({ type: 'answerSucceeded', gameId, index, response })
    } catch (error) {
      dispatch({ type: 'answerFailed', gameId, message: errorMessage(error) })
    }
  }

  function next() {
    dispatch({ type: 'next' })
  }

  async function finish() {
    if (state.phase !== 'playing' || state.finishing) return
    const { gameId } = state
    dispatch({ type: 'finishRequested', gameId })
    try {
      dispatch({ type: 'finishSucceeded', gameId, finish: await api.finish(gameId) })
    } catch (error) {
      dispatch({ type: 'finishFailed', gameId, message: errorMessage(error) })
    }
  }

  // The key handler is registered once and reads the latest render through this ref, which is updated
  // synchronously on commit. Re-registering in a passive effect would leave a moment right after the
  // server's verdict appears where Enter still sees the previous (unanswered) state.
  const latest = useRef({ state, confirmingQuit, answer, finish, next })
  useLayoutEffect(() => {
    latest.current = { state, confirmingQuit, answer, finish, next }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { state, confirmingQuit, answer, finish, next } = latest.current
      if (state.phase !== 'playing') return
      const target = event.target as HTMLElement | null
      const command = keyToCommand(event, {
        answered: isAnswered(state),
        choiceCount: state.questions[state.currentIndex].choices.length,
        blocked: state.showingIntro || state.finishing || confirmingQuit,
        focusOnControl: target?.closest('button, input, textarea, select, a') != null,
      })
      if (!command) return
      event.preventDefault()
      if (command.type === 'answer') void answer(command.choiceIndex)
      else if (isLastQuestion(state)) void finish()
      else next()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

  return (
    <div className={styles.app}>
      {/* While the quit dialog is open, the game behind it is inert (not focusable or read). */}
      <div inert={confirmingQuit}>
        {state.phase === 'start' && (
          <StartScreen
            initialNickname={state.nickname}
            starting={state.starting}
            serverError={state.error}
            onStart={(nickname) => void start(nickname)}
            onShowLeaderboard={() => dispatch({ type: 'showLeaderboard' })}
          />
        )}
        {state.phase === 'leaderboard' && <LeaderboardScreen onBack={() => dispatch({ type: 'closeLeaderboard' })} />}
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
              onAnswer={(choiceIndex) => void answer(choiceIndex)}
              onNext={next}
              onFinish={() => void finish()}
            />
          ))}
        {state.phase === 'result' && (
          <ResultScreen
            finish={state.finish}
            wrongAnswers={getWrongAnswers(state.questions, state.reveals)}
            onRestart={() => dispatch({ type: 'restart' })}
          />
        )}
      </div>
      {playing && confirmingQuit && (
        <ConfirmDialog
          title="게임을 그만둘까요?"
          message="지금까지 푼 기록은 저장되지 않고 순위표에도 남지 않습니다."
          confirmLabel="그만두기"
          cancelLabel="계속 풀기"
          onConfirm={confirmQuit}
          onCancel={() => setConfirmingQuit(false)}
        />
      )}
    </div>
  )
}
