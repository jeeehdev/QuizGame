import { describe, expect, it } from 'vitest'
import { checkNickname, loadBannedWords, parseBannedWords } from '../src/nicknameFilter.ts'

const banned = loadBannedWords(new URL('../data/banned-words.txt', import.meta.url))

describe('parseBannedWords', () => {
  it('skips comments and blank lines, lowercases, and handles CRLF', () => {
    expect(parseBannedWords('# 주석\r\n\r\n  FOO \r\nbar\n#x')).toEqual(['foo', 'bar'])
  })

  it('loads the shipped list', () => {
    expect(banned.length).toBeGreaterThan(10)
    expect(banned).not.toContain('')
  })
})

describe('checkNickname', () => {
  it.each(['홍길동', 'Player1', '퀴즈왕2026', '과학자'])('accepts %s', (name) => {
    expect(checkNickname(name, banned)).toBeNull()
  })

  it('applies the shared 2–10 char rule first', () => {
    expect(checkNickname('가', banned)).toMatch(/2~10자/)
    expect(checkNickname('a b', banned)).toMatch(/한글, 영문, 숫자/)
  })

  it.each(['시발', 'SHIT', 'xxFuckxx', '시1발', '병2신', '관리자'])('rejects %s', (name) => {
    expect(checkNickname(name, banned)).toMatch(/사용할 수 없는/)
  })
})
