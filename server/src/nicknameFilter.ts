import { readFileSync } from 'node:fs'
import { validateNickname } from '../../shared/nickname.ts'

/** Reads banned words: one per line, blank lines and lines starting with # are ignored. */
export function loadBannedWords(path: string | URL): string[] {
  return parseBannedWords(readFileSync(path, 'utf8'))
}

export function parseBannedWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/**
 * Returns an error message when the nickname breaks the shared rule (2–10 chars, Korean/English/digits)
 * or contains a banned word (case-insensitive, digits ignored so "시1발" still matches), or null when it is fine.
 */
export function checkNickname(raw: string, bannedWords: readonly string[]): string | null {
  const ruleError = validateNickname(raw)
  if (ruleError) return ruleError
  const normalized = raw.trim().toLowerCase()
  const lettersOnly = normalized.replace(/[0-9]/g, '')
  if (bannedWords.some((word) => normalized.includes(word) || lettersOnly.includes(word))) {
    return '사용할 수 없는 단어가 들어 있어요. 다른 닉네임을 입력해 주세요.'
  }
  return null
}
