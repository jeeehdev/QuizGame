import type { AppState, GameState } from '../types/quiz'
import { answerQuestion, endIntro, nextQuestion } from './game'

export type GameAction =
  | { type: 'start'; game: GameState }
  | { type: 'endIntro'; at: number }
  | { type: 'answer'; choiceIndex: number; at: number }
  | { type: 'next'; at: number }
  | { type: 'quit' }
  | { type: 'restart' }

export const initialAppState: AppState = { phase: 'start', nickname: '' }

// The game is created (and shuffled) outside the reducer so the reducer stays pure.
export function gameReducer(state: AppState, action: GameAction): AppState {
  switch (action.type) {
    case 'start':
      return state.phase === 'start' ? action.game : state
    case 'endIntro':
      return state.phase === 'playing' ? endIntro(state, action.at) : state
    case 'answer':
      return state.phase === 'playing' ? answerQuestion(state, action.choiceIndex, action.at) : state
    case 'next':
      return state.phase === 'playing' ? nextQuestion(state, action.at) : state
    // An abandoned game is discarded; it never produces a result.
    case 'quit':
      return state.phase === 'playing' ? { phase: 'start', nickname: state.nickname } : state
    case 'restart':
      return state.phase === 'result' ? { phase: 'start', nickname: state.nickname } : state
  }
}
