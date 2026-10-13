// @vitest-environment jsdom
import axe from 'axe-core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Question } from '../../server/src/game/types.ts'
import { formatQuestionFile } from '../../server/src/questionBank.ts'
import { installTestServer, serverQuestions, type TestServer } from '../test/testServer'
import TeacherApp from './TeacherApp'

const PASSWORD = 'correct-horse'
const candidate: Question = {
  id: 'geo-11',
  category: 'geography',
  difficulty: 'easy',
  question: '테스트용 후보 문제입니다. 정답은?',
  choices: ['가', '나', '다', '라'],
  answerIndex: 2,
  explanation: '테스트용 해설입니다.',
}

let dir: string
let bankPath: string
let candidatesPath: string
let server: TestServer

function install(teacherMode = true) {
  server = installTestServer({
    teacherPassword: teacherMode ? PASSWORD : undefined,
    candidates: [candidate],
    questionFiles: { bankPath, candidatesPath },
  })
}

beforeAll(() => {
  // axe probes canvas support, which jsdom does not implement.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quiz-teacher-ui-'))
  bankPath = join(dir, 'questions.json')
  candidatesPath = join(dir, 'question-candidates.json')
  copyFileSync(resolve(process.cwd(), 'server/data/questions.json'), bankPath)
  writeFileSync(candidatesPath, formatQuestionFile([candidate]))
  install()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  server.db.close()
  rmSync(dir, { recursive: true, force: true })
})

async function seriousViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

async function openLogin() {
  const view = render(<TeacherApp />)
  await screen.findByRole('heading', { name: '선생님 로그인' })
  return view
}

async function logIn(password = PASSWORD) {
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
}

async function openSwapScreen() {
  const view = await openLogin()
  await logIn()
  await screen.findByRole('heading', { name: '문제 교체' })
  await screen.findByText(/출제 문제 40개 · 후보 문제 1개/)
  return view
}

/** The radio for a question, found by its id inside the fieldset named "<slot> <kind>". */
function radio(slotAndKind: RegExp, id: string) {
  const group = screen.getByRole('group', { name: slotAndKind })
  return within(group).getByRole('radio', { name: new RegExp(id) })
}

describe('login', () => {
  it('shows only the login form without a session, with focus on the heading', async () => {
    await openLogin()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '선생님 로그인' })))
    expect(screen.queryByRole('heading', { name: '문제 교체' })).toBeNull()
  })

  it('asks for a password before sending', async () => {
    await openLogin()
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(screen.getByRole('alert')).toHaveProperty('textContent', '비밀번호를 입력해 주세요.')
    expect(server.calls).not.toContain('POST /api/teacher/login')
  })

  it('says when the password is wrong', async () => {
    await openLogin()
    await logIn('wrong-password')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('비밀번호가 맞지 않습니다.'))
    expect(screen.getByLabelText('비밀번호').getAttribute('aria-invalid')).toBe('true')
  })

  it('says how long to wait after too many wrong passwords', async () => {
    await openLogin()
    for (let i = 0; i < 5; i++) {
      await logIn('wrong-password')
      await waitFor(() => expect(screen.getByRole('button', { name: '로그인' })).toHaveProperty('disabled', false))
    }
    await logIn()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/\d+초 뒤에 다시 시도해 주세요/))
  })

  it('says when teacher mode is off', async () => {
    server.db.close()
    install(false)
    render(<TeacherApp />)
    expect(await screen.findByRole('heading', { name: '선생님 모드가 꺼져 있습니다' })).toBeTruthy()
  })

  it('has no serious accessibility violations', async () => {
    const { container } = await openLogin()
    expect(await seriousViolations(container)).toEqual([])
  })
})

describe('swap screen', () => {
  it('shows only slots with candidates by default, all 12 when the filter is off', async () => {
    await openSwapScreen()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('지리')
    fireEvent.click(screen.getByRole('checkbox', { name: '후보가 있는 칸만 보기' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12)
  })

  it('marks the answer of each question', async () => {
    await openSwapScreen()
    const group = screen.getByRole('group', { name: /지리 쉬움 후보 문제/ })
    expect(within(group).getByText('다').closest('li')!.textContent).toBe('다 ✓ 정답')
  })

  it('swaps after confirming and updates the lists and the files', async () => {
    await openSwapScreen()
    const button = screen.getByRole('button', { name: '출제 문제와 후보를 하나씩 고르세요' })
    expect(button).toHaveProperty('disabled', true)

    fireEvent.click(radio(/지리 쉬움 출제 문제/, 'geo-01'))
    fireEvent.click(radio(/지리 쉬움 후보 문제/, 'geo-11'))
    fireEvent.click(screen.getByRole('button', { name: 'geo-01 ↔ geo-11 바꾸기' }))

    const dialog = screen.getByRole('alertdialog', { name: '문제를 바꿀까요?' })
    expect(dialog.textContent).toMatch(/geo-01.*빼고.*geo-11.*넣습니다/)
    fireEvent.click(within(dialog).getByRole('button', { name: '바꾸기' }))

    const status = await screen.findByText(/geo-01를 빼고 geo-11를 넣었습니다/)
    await waitFor(() => expect(document.activeElement).toBe(status))
    expect(within(screen.getByRole('group', { name: /지리 쉬움 후보 문제/ })).getByRole('radio', { name: /geo-01/ })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: /지리 쉬움 출제 문제/ })).getByRole('radio', { name: /geo-11/ })).toBeTruthy()

    const bankIds = (JSON.parse(readFileSync(bankPath, 'utf8')) as Question[]).map((q) => q.id)
    expect(bankIds).toContain('geo-11')
    expect(bankIds).not.toContain('geo-01')
  })

  it('does nothing when the dialog is cancelled', async () => {
    await openSwapScreen()
    fireEvent.click(radio(/지리 쉬움 출제 문제/, 'geo-01'))
    fireEvent.click(radio(/지리 쉬움 후보 문제/, 'geo-11'))
    fireEvent.click(screen.getByRole('button', { name: 'geo-01 ↔ geo-11 바꾸기' }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(server.calls).not.toContain('POST /api/teacher/swap')
    expect(readFileSync(bankPath, 'utf8')).toBe(readFileSync(resolve(process.cwd(), 'server/data/questions.json'), 'utf8'))
  })

  it('goes back to the login screen when the session has expired', async () => {
    await openSwapScreen()
    server.db.exec('DELETE FROM teacher_sessions')
    fireEvent.click(radio(/지리 쉬움 출제 문제/, 'geo-01'))
    fireEvent.click(radio(/지리 쉬움 후보 문제/, 'geo-11'))
    fireEvent.click(screen.getByRole('button', { name: 'geo-01 ↔ geo-11 바꾸기' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '바꾸기' }))
    await screen.findByRole('heading', { name: '선생님 로그인' })
    expect(screen.getByRole('status').textContent).toBe('로그인이 만료되었습니다. 다시 로그인해 주세요.')
    expect(readFileSync(bankPath, 'utf8')).not.toContain('geo-11')
  })

  it('logs out', async () => {
    await openSwapScreen()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await screen.findByRole('heading', { name: '선생님 로그인' })
    expect(screen.getByRole('status').textContent).toBe('로그아웃했습니다.')
    cleanup()
    render(<TeacherApp />)
    await screen.findByRole('heading', { name: '선생님 로그인' })
  })

  it('stays logged in after reloading the page', async () => {
    await openSwapScreen()
    cleanup()
    render(<TeacherApp />)
    expect(await screen.findByRole('heading', { name: '문제 교체' })).toBeTruthy()
  })

  it('uses native radios and buttons for every control', async () => {
    await openSwapScreen()
    fireEvent.click(screen.getByRole('checkbox', { name: '후보가 있는 칸만 보기' }))
    expect(screen.getAllByRole('radio')).toHaveLength(serverQuestions.length + 1)
    for (const el of screen.getAllByRole('radio')) expect(el.tagName).toBe('INPUT')
  })

  it('has no serious accessibility violations, with all slots and the dialog open', async () => {
    const { container } = await openSwapScreen()
    fireEvent.click(screen.getByRole('checkbox', { name: '후보가 있는 칸만 보기' }))
    expect(await seriousViolations(container)).toEqual([])
    fireEvent.click(radio(/지리 쉬움 출제 문제/, 'geo-01'))
    fireEvent.click(radio(/지리 쉬움 후보 문제/, 'geo-11'))
    fireEvent.click(screen.getByRole('button', { name: 'geo-01 ↔ geo-11 바꾸기' }))
    expect(await seriousViolations(container)).toEqual([])
  })
})
