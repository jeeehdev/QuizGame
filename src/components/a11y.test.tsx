// @vitest-environment jsdom
import axe from 'axe-core'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, toPublicQuestion } from '../../server/src/game/game.ts'
import { seededRandom } from '../../server/src/game/shuffle.ts'
import { getWrongAnswers, type PlayingState } from '../game/reducer'
import { installTestServer, serverQuestions } from '../test/testServer'
import type { FinishResponse, Reveal } from '../types/quiz'
import { CategoryIntro } from './CategoryIntro'
import { ConfirmDialog } from './ConfirmDialog'
import { LeaderboardScreen } from './LeaderboardScreen'
import { QuestionScreen } from './QuestionScreen'
import { ResultScreen } from './ResultScreen'
import { StartScreen } from './StartScreen'

const noop = () => {}
const game = createGame(serverQuestions, '테스터', { random: seededRandom(1), now: 0 })
const questions = game.questions.map(toPublicQuestion)
const reveal = (i: number, correct: boolean): Reveal => {
  const q = game.questions[i]
  return { choiceIndex: correct ? q.answerIndex : (q.answerIndex + 1) % 4, correct, answerIndex: q.answerIndex, explanation: q.explanation }
}

const playing: PlayingState = {
  phase: 'playing',
  gameId: 'g',
  nickname: '테스터',
  questions,
  currentIndex: 0,
  reveals: [],
  score: 0,
  showingIntro: false,
  pendingChoice: null,
  finishing: false,
  error: null,
}

function finishFor(reveals: Reveal[], rank: number): FinishResponse {
  const correctCount = reveals.filter((r) => r.correct).length
  return {
    scoreId: 1,
    rank,
    result: {
      nickname: '테스터',
      score: correctCount * 10,
      correctCount,
      total: 40,
      correctByCategory: { history: 5, science: 5, geography: 5, arts: 5 },
      totalByCategory: { history: 10, science: 10, geography: 10, arts: 10 },
      durationSec: 100,
      records: [],
    },
  }
}

/** Runs axe on the rendered screen. jsdom has no layout, so color contrast is checked in a real browser instead. */
async function violations(ui: ReactElement, ready?: () => Promise<unknown>) {
  const { container } = render(<div lang="ko">{ui}</div>)
  await ready?.()
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

beforeAll(() => {
  // axe probes canvas support, which jsdom does not implement.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

beforeEach(() => {
  installTestServer()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('accessibility (axe, serious and critical)', () => {
  const toolbar = { soundEnabled: true, onToggleSound: noop, onQuit: noop, onAnswer: noop, onNext: noop, onFinish: noop }

  it('start screen, including a server error', async () => {
    expect(
      await violations(<StartScreen initialNickname="" starting={false} serverError={null} onStart={noop} onShowLeaderboard={noop} />),
    ).toEqual([])
    cleanup()
    expect(
      await violations(<StartScreen initialNickname="닉" starting={false} serverError="오류" onStart={noop} onShowLeaderboard={noop} />),
    ).toEqual([])
  })

  it('category intro', async () => {
    expect(await violations(<CategoryIntro category="science" questionCount={10} />)).toEqual([])
  })

  it('question screen before answering', async () => {
    expect(await violations(<QuestionScreen state={playing} {...toolbar} />)).toEqual([])
  })

  it('question screen waiting for the server, and after a failed answer', async () => {
    expect(await violations(<QuestionScreen state={{ ...playing, pendingChoice: 1 }} {...toolbar} />)).toEqual([])
    cleanup()
    expect(
      await violations(<QuestionScreen state={{ ...playing, pendingChoice: 1, error: '네트워크 오류' }} {...toolbar} />),
    ).toEqual([])
  })

  it('question screen with feedback, and with a failed save on the last question', async () => {
    expect(await violations(<QuestionScreen state={{ ...playing, reveals: [reveal(0, false)] }} {...toolbar} />)).toEqual([])
    cleanup()
    const all = questions.map((_, i) => reveal(i, i % 2 === 0))
    expect(
      await violations(<QuestionScreen state={{ ...playing, currentIndex: 39, reveals: all, error: '저장 실패' }} {...toolbar} />),
    ).toEqual([])
  })

  it('result screen with a wrong-answer note and my record outside the top 10', async () => {
    const reveals = questions.map((_, i) => reveal(i, i % 2 === 0))
    expect(
      await violations(
        <ResultScreen finish={finishFor(reveals, 37)} wrongAnswers={getWrongAnswers(questions, reveals)} onRestart={noop} />,
        () => screen.findByText(/아직 기록이 없습니다|내 기록/),
      ),
    ).toEqual([])
  })

  it('result screen with no wrong answers', async () => {
    const reveals = questions.map((_, i) => reveal(i, true))
    expect(
      await violations(
        <ResultScreen finish={finishFor(reveals, 1)} wrongAnswers={getWrongAnswers(questions, reveals)} onRestart={noop} />,
        () => screen.findByText(/아직 기록이 없습니다|내 기록/),
      ),
    ).toEqual([])
  })

  it('leaderboard screen', async () => {
    expect(await violations(<LeaderboardScreen onBack={noop} />, () => screen.findByText(/아직 기록이 없습니다/))).toEqual([])
  })

  it('quit confirm dialog', async () => {
    expect(
      await violations(
        <ConfirmDialog title="그만둘까요?" message="기록은 남지 않습니다." confirmLabel="그만두기" cancelLabel="계속 풀기" onConfirm={noop} onCancel={noop} />,
      ),
    ).toEqual([])
  })
})
