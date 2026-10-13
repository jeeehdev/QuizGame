// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CATEGORY_INTRO_MS } from './game/game'

function press(key: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key })
}

function finishIntro() {
  act(() => {
    vi.advanceTimersByTime(CATEGORY_INTRO_MS)
  })
}

function startGame() {
  render(<App />)
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '키보드' } })
  fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
}

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom has no audio playback.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('shows a 1-second intro before each category and can be played to the end with the keyboard only', () => {
    startGame()
    const intros: string[] = []
    for (let i = 0; i < 40; i++) {
      const intro = screen.queryByRole('status')
      if (intro) {
        intros.push(`${i + 1}: ${intro.textContent}`)
        // Still the intro just before one second passes.
        act(() => {
          vi.advanceTimersByTime(CATEGORY_INTRO_MS - 1)
        })
        expect(screen.queryByRole('group', { name: /보기/ })).toBeNull()
        act(() => {
          vi.advanceTimersByTime(1)
        })
      }
      expect(screen.getByText(`${i + 1}/40`)).toBeTruthy()
      // Focus moves to the question text when it appears.
      expect(document.activeElement?.tagName).toBe('H2')
      press(String((i % 4) + 1))
      expect(screen.getByRole('button', { name: /다음 문제|결과 보기/ })).toBeTruthy()
      // Focus is on the "다음 문제" button; Enter must advance exactly one question.
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
      fireEvent.click(document.activeElement!)
    }
    expect(intros).toEqual([
      '1: 카테고리 1/4한국사 — 10문제',
      '11: 카테고리 2/4과학 — 10문제',
      '21: 카테고리 3/4지리 — 10문제',
      '31: 카테고리 4/4예술과 문화 — 10문제',
    ])
    expect(screen.getByRole('heading', { name: '키보드님의 결과' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /오답 노트/ })).toBeTruthy()
  })

  it('advances with Enter when focus is on the question text', () => {
    startGame()
    finishIntro()
    press('2')
    ;(screen.getByRole('heading', { level: 2 }) as HTMLElement).focus()
    press('Enter')
    expect(screen.getByText('2/40')).toBeTruthy()
  })

  it('does not change an answer with another number key', () => {
    startGame()
    finishIntro()
    press('1')
    const chosen = screen.getAllByRole('button', { name: /내가 고른 답/ })
    press('2')
    expect(screen.getAllByRole('button', { name: /내가 고른 답/ })).toEqual(chosen)
    expect(screen.getByText('1/40')).toBeTruthy()
  })

  it('asks before quitting; cancelling keeps the game, confirming returns to the start screen', () => {
    startGame()
    finishIntro()
    press('1')
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    // Game keys are blocked while the dialog is open.
    fireEvent.click(screen.getByRole('button', { name: '계속 풀기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('1/40')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /내가 고른 답/ })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy()
    expect((screen.getByLabelText('닉네임') as HTMLInputElement).value).toBe('키보드')
  })

  it('closes the quit dialog with Escape and ignores game keys while it is open', () => {
    startGame()
    finishIntro()
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    press('1')
    expect(screen.queryAllByRole('button', { name: /내가 고른 답/ })).toHaveLength(0)
    press('Escape')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens the quit dialog on the browser back button', () => {
    startGame()
    finishIntro()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('toggles sound and remembers the choice', () => {
    startGame()
    finishIntro()
    const toggle = screen.getByRole('button', { name: /효과음/ })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: /효과음/ }).getAttribute('aria-pressed')).toBe('false')
    expect(localStorage.getItem('quiz.soundEnabled')).toBe('false')
    localStorage.clear()
  })
})
