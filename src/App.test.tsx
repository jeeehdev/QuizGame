// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { correctChoiceIndex, installTestServer, serverQuestions, type TestServer } from './test/testServer'

const INTRO_WAIT = { timeout: 2500 }
let server: TestServer

beforeEach(() => {
  server = installTestServer()
  // jsdom has no audio playback.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function press(key: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key })
}

/** The question on screen (id and shuffled choices), identified by its text. */
function shownQuestion() {
  const text = screen.getByRole('heading', { level: 2 }).textContent!.replace(/^\d+번 문제\.\s*/, '')
  const choices = within(screen.getByRole('group', { name: /보기/ }))
    .getAllByRole('button')
    .map((b) => b.querySelector('span:nth-child(2)')!.textContent!)
  return { id: serverQuestions.find((q) => q.question === text)!.id, choices }
}

async function startGame(nickname = '키보드') {
  render(<App />)
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: nickname } })
  fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
  await screen.findByRole('group', { name: /보기/ }, INTRO_WAIT)
}

describe('App with the server', () => {
  it('plays a whole game with the keyboard, saves it, and shows my rank and the leaderboard', { timeout: 20_000 }, async () => {
    await startGame()
    let correct = 0
    for (let i = 0; i < 40; i++) {
      if (!screen.queryByRole('group', { name: /보기/ })) {
        expect(screen.getByRole('status').textContent).toMatch(/— 10문제/)
        await screen.findByRole('group', { name: /보기/ }, INTRO_WAIT)
      }
      expect(screen.getByText(`${i + 1}/40`)).toBeTruthy()
      expect(document.activeElement?.tagName).toBe('H2')

      // Answer the first 25 correctly.
      const q = shownQuestion()
      const choice = i < 25 ? correctChoiceIndex(q) : (correctChoiceIndex(q) + 1) % 4
      if (i < 25) correct++
      press(String(choice + 1))
      await screen.findByRole('button', { name: /다음 문제|결과 보기/ })
      expect(screen.getByText(`${correct * 10}점`)).toBeTruthy()
      ;(screen.getByRole('heading', { level: 2 }) as HTMLElement).focus()
      press('Enter')
    }

    await screen.findByRole('heading', { name: '키보드님의 결과' })
    expect(screen.getByText('250')).toBeTruthy()
    expect(screen.getByText('1위')).toBeTruthy()
    const myRow = await screen.findByRole('row', { current: true })
    expect(within(myRow).getByText('내 기록')).toBeTruthy()
    expect(within(myRow).getByText('250')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /오답 노트/ }).textContent).toContain('15문제')

    // Exactly one request per answer, then one finish.
    expect(server.calls.filter((c) => c.includes('/answers'))).toHaveLength(40)
    expect(server.calls.filter((c) => c.endsWith('/finish'))).toHaveLength(1)
  })

  it('shows the chosen button as pressed while waiting, then the feedback', async () => {
    await startGame()
    fireEvent.click(within(screen.getByRole('group', { name: /보기/ })).getAllByRole('button')[1])
    const pressed = within(screen.getByRole('group', { name: /보기/ })).getByRole('button', { pressed: true })
    expect(pressed.getAttribute('aria-label')).toMatch(/^2번/)
    await screen.findByRole('button', { name: '다음 문제' })
    expect(screen.getAllByRole('button', { name: /내가 고른 답/ })).toHaveLength(1)
  })

  it('shows an error with a retry button when an answer cannot be sent, keeping the chosen answer', async () => {
    await startGame()
    server.failNext(/\/answers$/)
    press('3')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('답안을 보내지 못했습니다')
    // Only the chosen answer can be retried; the others stay locked.
    const choices = within(screen.getByRole('group', { name: /보기/ })).getAllByRole('button')
    expect(choices.map((b) => (b as HTMLButtonElement).disabled)).toEqual([true, true, false, true])
    press('1')
    expect(screen.queryByRole('button', { name: '다음 문제' })).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('button', { name: '다음 문제' })
    expect(screen.getAllByRole('button', { name: /3번.*내가 고른 답/ })).toHaveLength(1)
  })

  it('recovers when the server recorded the answer but the response was lost', async () => {
    await startGame()
    server.loseResponseNext(/\/answers$/)
    press('2')
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('button', { name: '다음 문제' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an error with a retry button when the result cannot be saved', { timeout: 20_000 }, async () => {
    await startGame()
    for (let i = 0; i < 40; i++) {
      if (!screen.queryByRole('group', { name: /보기/ })) await screen.findByRole('group', { name: /보기/ }, INTRO_WAIT)
      press('1')
      await screen.findByRole('button', { name: /다음 문제|결과 보기/ })
      if (i < 39) fireEvent.click(screen.getByRole('button', { name: '다음 문제' }))
    }
    server.failNext(/\/finish$/)
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('결과를 저장하지 못했습니다')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '키보드님의 결과' })
  })

  it('shows the server message when the nickname is rejected', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '시발' } })
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('사용할 수 없는 단어'))
    expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy()
  })

  it('shows a network error on the start screen and lets the player try again', async () => {
    render(<App />)
    server.failNext(/POST \/api\/games$/)
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '오프라인' } })
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('서버에 연결하지 못했습니다'))
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    await screen.findByRole('group', { name: /보기/ }, INTRO_WAIT)
  })

  it('opens the leaderboard from the start screen and goes back', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '순위표 보기' }))
    expect(screen.getByRole('heading', { name: '순위표' })).toBeTruthy()
    await screen.findByText(/아직 기록이 없습니다/)
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy()
  })

  it('shows a retry button when the leaderboard cannot be loaded', async () => {
    render(<App />)
    server.failNext(/leaderboard/)
    fireEvent.click(screen.getByRole('button', { name: '순위표 보기' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('순위표를 불러오지 못했습니다')
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }))
    await screen.findByText(/아직 기록이 없습니다/)
  })

  it('asks before quitting; cancelling keeps the game, confirming discards it', async () => {
    await startGame()
    press('1')
    await screen.findByRole('button', { name: '다음 문제' })
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '계속 풀기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('1/40')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    expect((screen.getByLabelText('닉네임') as HTMLInputElement).value).toBe('키보드')
    expect(server.calls.some((c) => c.endsWith('/finish'))).toBe(false)
    expect((server.db.prepare('SELECT COUNT(*) AS n FROM scores').get() as { n: number }).n).toBe(0)
  })

  it('opens the quit dialog on the browser back button and ignores game keys while it is open', async () => {
    await startGame()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    press('1')
    expect(within(screen.getByRole('group', { name: /보기/ })).queryByRole('button', { pressed: true })).toBeNull()
    press('Escape')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('toggles sound and remembers the choice', async () => {
    await startGame()
    const toggle = screen.getByRole('button', { name: /효과음/ })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: /효과음/ }).getAttribute('aria-pressed')).toBe('false')
    expect(localStorage.getItem('quiz.soundEnabled')).toBe('false')
  })
})
