// @vitest-environment jsdom
import axe from 'axe-core'
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import rawQuestions from '../data/questions.json'
import { loadQuestions } from '../data/validateQuestions'
import { answerQuestion, createGame, endIntro, getResult, getWrongAnswers, nextQuestion } from '../game/game'
import { seededRandom } from '../game/shuffle'
import type { GameState } from '../types/quiz'
import { CategoryIntro } from './CategoryIntro'
import { ConfirmDialog } from './ConfirmDialog'
import { QuestionScreen } from './QuestionScreen'
import { ResultScreen } from './ResultScreen'
import { StartScreen } from './StartScreen'

const questions = loadQuestions(rawQuestions)
const noop = () => {}

function playedGame(correctEvery: number): GameState {
  let s = createGame(questions, '테스터', { random: seededRandom(1), now: 0 })
  for (let i = 0; i < 40; i++) {
    if (s.showingIntro) s = endIntro(s, i)
    const q = s.questions[s.currentIndex]
    s = nextQuestion(answerQuestion(s, i % correctEvery === 0 ? q.answerIndex : (q.answerIndex + 1) % 4, i), i)
  }
  return s
}

/** Runs axe on the rendered screen. jsdom has no layout, so color contrast is checked in a real browser instead. */
async function violations(ui: ReactElement) {
  const { container } = render(<div lang="ko">{ui}</div>)
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

beforeAll(() => {
  // axe probes canvas support, which jsdom does not implement.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(cleanup)

describe('accessibility (axe, serious and critical)', () => {
  const game = endIntro(createGame(questions, '테스터', { random: seededRandom(1), now: 0 }), 0)
  const answeredWrong = answerQuestion(game, (game.questions[0].answerIndex + 1) % 4, 1)
  const toolbar = { soundEnabled: true, onToggleSound: noop, onQuit: noop, onAnswer: noop, onNext: noop }

  it('start screen', async () => {
    expect(await violations(<StartScreen initialNickname="" onStart={noop} />)).toEqual([])
  })

  it('category intro', async () => {
    expect(await violations(<CategoryIntro category="science" questionCount={10} />)).toEqual([])
  })

  it('question screen before answering', async () => {
    expect(await violations(<QuestionScreen state={game} {...toolbar} />)).toEqual([])
  })

  it('question screen with feedback', async () => {
    expect(await violations(<QuestionScreen state={answeredWrong} {...toolbar} />)).toEqual([])
  })

  it('result screen with a wrong-answer note', async () => {
    const s = playedGame(2)
    expect(
      await violations(<ResultScreen result={getResult(s)} wrongAnswers={getWrongAnswers(s)} onRestart={noop} />),
    ).toEqual([])
  })

  it('result screen with no wrong answers', async () => {
    const s = playedGame(1)
    expect(
      await violations(<ResultScreen result={getResult(s)} wrongAnswers={getWrongAnswers(s)} onRestart={noop} />),
    ).toEqual([])
  })

  it('quit confirm dialog', async () => {
    expect(
      await violations(
        <ConfirmDialog title="그만둘까요?" message="기록은 남지 않습니다." confirmLabel="그만두기" cancelLabel="계속 풀기" onConfirm={noop} onCancel={noop} />,
      ),
    ).toEqual([])
  })
})
