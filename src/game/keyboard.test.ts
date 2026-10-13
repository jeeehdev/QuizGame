import { describe, expect, it } from 'vitest'
import { keyToCommand, type KeyContext } from './keyboard'

const before: KeyContext = { answered: false, choiceCount: 4, blocked: false }
const after: KeyContext = { answered: true, choiceCount: 4, blocked: false }

describe('keyToCommand', () => {
  it.each([
    ['1', 0],
    ['2', 1],
    ['3', 2],
    ['4', 3],
  ])('maps key %s to choice %i before answering', (key, choiceIndex) => {
    expect(keyToCommand({ key }, before)).toEqual({ type: 'answer', choiceIndex })
  })

  it('ignores digits outside the choices', () => {
    expect(keyToCommand({ key: '5' }, before)).toBeNull()
    expect(keyToCommand({ key: '0' }, before)).toBeNull()
    expect(keyToCommand({ key: '2' }, { ...before, choiceCount: 1 })).toBeNull()
  })

  it('ignores digits after answering, so the answer cannot change', () => {
    expect(keyToCommand({ key: '1' }, after)).toBeNull()
  })

  it('maps Enter to the next question only after answering', () => {
    expect(keyToCommand({ key: 'Enter' }, after)).toEqual({ type: 'next' })
    expect(keyToCommand({ key: 'Enter' }, before)).toBeNull()
  })

  it('leaves Enter to a focused button so it is not handled twice', () => {
    expect(keyToCommand({ key: 'Enter' }, { ...after, focusOnControl: true })).toBeNull()
    expect(keyToCommand({ key: '2' }, { ...before, focusOnControl: true })).toEqual({ type: 'answer', choiceIndex: 1 })
  })

  it('ignores everything while an intro or dialog is showing', () => {
    expect(keyToCommand({ key: '1' }, { ...before, blocked: true })).toBeNull()
    expect(keyToCommand({ key: 'Enter' }, { ...after, blocked: true })).toBeNull()
  })

  it('ignores key repeat and modifier shortcuts', () => {
    expect(keyToCommand({ key: '1', repeat: true }, before)).toBeNull()
    expect(keyToCommand({ key: '1', ctrlKey: true }, before)).toBeNull()
    expect(keyToCommand({ key: '1', metaKey: true }, before)).toBeNull()
    expect(keyToCommand({ key: '1', altKey: true }, before)).toBeNull()
  })

  it('ignores other keys', () => {
    expect(keyToCommand({ key: 'a' }, before)).toBeNull()
    expect(keyToCommand({ key: ' ' }, after)).toBeNull()
  })
})
