import { describe, expect, it } from 'vitest'
import { validateNickname } from './nickname.ts'

describe('validateNickname', () => {
  it.each(['홍길', 'abc', 'Player1', '퀴즈왕2026', '가나다라마바사아자차'])('accepts %s', (name) => {
    expect(validateNickname(name)).toBeNull()
  })

  it.each(['', '가', 'a', '가나다라마바사아자차카'])('rejects %s for length', (name) => {
    expect(validateNickname(name)).toMatch(/2~10자/)
  })

  it.each(['홍 길동', 'abc!', 'ㅋㅋㅋ', 'name_1', '😀😀'])('rejects %s for characters', (name) => {
    expect(validateNickname(name)).toMatch(/한글, 영문, 숫자/)
  })

  it('ignores surrounding spaces', () => {
    expect(validateNickname('  홍길동  ')).toBeNull()
  })
})
