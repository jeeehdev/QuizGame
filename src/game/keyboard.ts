export type KeyCommand = { type: 'answer'; choiceIndex: number } | { type: 'next' }

export interface KeyContext {
  /** The current question has been answered (feedback is showing). */
  answered: boolean
  /** Number of choices on screen. */
  choiceCount: number
  /** Keys are ignored while a category intro or a dialog is showing. */
  blocked: boolean
  /** Focus is on a button or field, which handles Enter itself (e.g. the focused "다음 문제" button). */
  focusOnControl?: boolean
}

export interface KeyInput {
  key: string
  repeat?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/** Maps a key press on the question screen to a game command: 1–4 choose an answer, Enter goes to the next question. */
export function keyToCommand(input: KeyInput, context: KeyContext): KeyCommand | null {
  if (context.blocked || input.repeat || input.altKey || input.ctrlKey || input.metaKey) return null

  if (!context.answered && /^[1-9]$/.test(input.key)) {
    const choiceIndex = Number(input.key) - 1
    return choiceIndex < context.choiceCount ? { type: 'answer', choiceIndex } : null
  }
  if (context.answered && input.key === 'Enter' && !context.focusOnControl) return { type: 'next' }
  return null
}
