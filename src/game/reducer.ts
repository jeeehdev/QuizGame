import {
  isCategoryStart,
  type AnswerResponse,
  type CreateGameResponse,
  type FinishResponse,
  type PublicQuestion,
  type Reveal,
  type WrongAnswer,
} from '../types/quiz'

export interface StartState {
  phase: 'start'
  nickname: string
  starting: boolean
  error: string | null
}

export interface LeaderboardState {
  phase: 'leaderboard'
  nickname: string
}

export interface PlayingState {
  phase: 'playing'
  gameId: string
  nickname: string
  questions: PublicQuestion[]
  currentIndex: number
  /** reveals[i] is the server's verdict on questions[i]; length = number of answered questions. */
  reveals: Reveal[]
  score: number
  /** True while the 1-second category intro is shown. */
  showingIntro: boolean
  /** The choice sent to the server and not yet confirmed. Stays set after a failure so it can be retried. */
  pendingChoice: number | null
  /** Saving the finished game is in progress. */
  finishing: boolean
  /** Message for a failed answer or finish request, shown with a retry button. */
  error: string | null
}

export interface ResultState {
  phase: 'result'
  gameId: string
  nickname: string
  questions: PublicQuestion[]
  reveals: Reveal[]
  finish: FinishResponse
}

export type AppState = StartState | LeaderboardState | PlayingState | ResultState

export type GameAction =
  | { type: 'startRequested'; nickname: string }
  | { type: 'startFailed'; message: string }
  | { type: 'gameCreated'; game: CreateGameResponse }
  | { type: 'endIntro' }
  | { type: 'answerRequested'; gameId: string; choiceIndex: number }
  | { type: 'answerSucceeded'; gameId: string; index: number; response: AnswerResponse }
  | { type: 'answerFailed'; gameId: string; message: string }
  | { type: 'next' }
  | { type: 'finishRequested'; gameId: string }
  | { type: 'finishSucceeded'; gameId: string; finish: FinishResponse }
  | { type: 'finishFailed'; gameId: string; message: string }
  | { type: 'quit' }
  | { type: 'restart' }
  | { type: 'showLeaderboard' }
  | { type: 'closeLeaderboard' }

export const initialAppState: AppState = { phase: 'start', nickname: '', starting: false, error: null }

export function isAnswered(state: PlayingState): boolean {
  return state.reveals.length > state.currentIndex
}

export function isLastQuestion(state: PlayingState): boolean {
  return state.currentIndex === state.questions.length - 1
}

/**
 * Whether a choice can be sent now: not during an intro or while saving, not after the answer is known,
 * and while a request is pending or failed only the same choice (a retry) is allowed.
 */
export function canSendAnswer(state: PlayingState, choiceIndex: number): boolean {
  if (state.showingIntro || state.finishing || isAnswered(state)) return false
  if (state.pendingChoice === null) return true
  return state.error !== null && state.pendingChoice === choiceIndex
}

const forGame = (state: AppState, gameId: string): state is PlayingState =>
  state.phase === 'playing' && state.gameId === gameId

// Network requests run in App; the reducer only records what was asked and what came back.
// Responses for a game that was quit (different gameId or phase) are ignored.
export function gameReducer(state: AppState, action: GameAction): AppState {
  switch (action.type) {
    case 'startRequested':
      return state.phase === 'start' && !state.starting
        ? { ...state, nickname: action.nickname, starting: true, error: null }
        : state
    case 'startFailed':
      return state.phase === 'start' ? { ...state, starting: false, error: action.message } : state
    case 'gameCreated':
      if (state.phase !== 'start' || !state.starting) return state
      return {
        phase: 'playing',
        gameId: action.game.gameId,
        nickname: action.game.nickname,
        questions: action.game.questions,
        currentIndex: 0,
        reveals: [],
        score: 0,
        showingIntro: true,
        pendingChoice: null,
        finishing: false,
        error: null,
      }
    case 'endIntro':
      return state.phase === 'playing' && state.showingIntro ? { ...state, showingIntro: false } : state
    case 'answerRequested':
      if (!forGame(state, action.gameId) || !canSendAnswer(state, action.choiceIndex)) return state
      return { ...state, pendingChoice: action.choiceIndex, error: null }
    case 'answerSucceeded': {
      if (!forGame(state, action.gameId) || action.index !== state.currentIndex || isAnswered(state)) return state
      const { correct, answerIndex, explanation, score } = action.response
      return {
        ...state,
        reveals: [...state.reveals, { choiceIndex: state.pendingChoice ?? -1, correct, answerIndex, explanation }],
        score,
        pendingChoice: null,
        error: null,
      }
    }
    case 'answerFailed':
      return forGame(state, action.gameId) && state.pendingChoice !== null ? { ...state, error: action.message } : state
    case 'next': {
      if (state.phase !== 'playing' || !isAnswered(state) || isLastQuestion(state)) return state
      const nextIndex = state.currentIndex + 1
      return { ...state, currentIndex: nextIndex, showingIntro: isCategoryStart(state.questions, nextIndex) }
    }
    case 'finishRequested':
      if (!forGame(state, action.gameId) || !isLastQuestion(state) || !isAnswered(state) || state.finishing) return state
      return { ...state, finishing: true, error: null }
    case 'finishSucceeded':
      if (!forGame(state, action.gameId) || !state.finishing) return state
      return {
        phase: 'result',
        gameId: state.gameId,
        nickname: state.nickname,
        questions: state.questions,
        reveals: state.reveals,
        finish: action.finish,
      }
    case 'finishFailed':
      return forGame(state, action.gameId) && state.finishing ? { ...state, finishing: false, error: action.message } : state
    // An abandoned game is discarded; it is never saved (the server deletes it after 24 hours).
    case 'quit':
      return state.phase === 'playing' ? { phase: 'start', nickname: state.nickname, starting: false, error: null } : state
    case 'restart':
      return state.phase === 'result' ? { phase: 'start', nickname: state.nickname, starting: false, error: null } : state
    case 'showLeaderboard':
      return state.phase === 'start' && !state.starting ? { phase: 'leaderboard', nickname: state.nickname } : state
    case 'closeLeaderboard':
      return state.phase === 'leaderboard' ? { phase: 'start', nickname: state.nickname, starting: false, error: null } : state
  }
}

/** Questions answered wrong, in the order asked, with the chosen and correct choice text. */
export function getWrongAnswers(questions: readonly PublicQuestion[], reveals: readonly Reveal[]): WrongAnswer[] {
  return reveals.flatMap((reveal, i) => {
    if (reveal.correct) return []
    const q = questions[i]
    return [
      {
        questionId: q.id,
        category: q.category,
        question: q.question,
        chosen: q.choices[reveal.choiceIndex],
        correctChoice: q.choices[reveal.answerIndex],
        explanation: reveal.explanation,
      },
    ]
  })
}
