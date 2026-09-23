import { describe, expect, it } from 'vitest'
import { isPaletteHotkey, paletteKeyIntent } from './palette-key-intent'

type Key = Parameters<typeof paletteKeyIntent>[0]

const key = (k: string, mods: Partial<Key> = {}): Key => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
})

describe('paletteKeyIntent at the root level', () => {
  it('navigates with arrows, opens with Enter, closes with Escape', () => {
    expect(paletteKeyIntent(key('ArrowDown'), 'root')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('ArrowUp'), 'root')).toEqual({ kind: 'prev' })
    expect(paletteKeyIntent(key('Enter'), 'root')).toEqual({ kind: 'enter' })
    expect(paletteKeyIntent(key('Escape'), 'root')).toEqual({ kind: 'close' })
  })

  it('leaves j and k alone — the root level owns a text query', () => {
    expect(paletteKeyIntent(key('j'), 'root')).toBeNull()
    expect(paletteKeyIntent(key('k'), 'root')).toBeNull()
  })

  it('leaves Backspace and ArrowLeft alone — they edit the query and move the caret', () => {
    expect(paletteKeyIntent(key('Backspace'), 'root')).toBeNull()
    expect(paletteKeyIntent(key('ArrowLeft'), 'root')).toBeNull()
  })

  it('ignores ordinary typing', () => {
    expect(paletteKeyIntent(key('h'), 'root')).toBeNull()
    expect(paletteKeyIntent(key('-'), 'root')).toBeNull()
  })
})

describe('paletteKeyIntent at the action level', () => {
  it('adds j / k navigation where there is no text input to steal them from', () => {
    expect(paletteKeyIntent(key('j'), 'actions')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('K'), 'actions')).toEqual({ kind: 'prev' })
  })

  it('pops one level on Backspace or ArrowLeft', () => {
    expect(paletteKeyIntent(key('Backspace'), 'actions')).toEqual({ kind: 'back' })
    expect(paletteKeyIntent(key('ArrowLeft'), 'actions')).toEqual({ kind: 'back' })
  })

  it('keeps the shared arrow / Enter / Escape meanings', () => {
    expect(paletteKeyIntent(key('ArrowDown'), 'actions')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('Escape'), 'actions')).toEqual({ kind: 'close' })
  })
})

describe('paletteKeyIntent action shortcuts', () => {
  it('resolves a curated letter to its action, at a list level only', () => {
    expect(paletteKeyIntent(key('s'), 'actions')).toEqual({
      kind: 'action',
      action: 'change-status',
    })
    expect(paletteKeyIntent(key('y'), 'actions')).toEqual({
      kind: 'action',
      action: 'copy-issue-key',
    })
    expect(paletteKeyIntent(key('W'), 'actions')).toEqual({
      kind: 'action',
      action: 'watchlist-toggle',
    })
    // At root the same letters are just text.
    expect(paletteKeyIntent(key('s'), 'root')).toBeNull()
    expect(paletteKeyIntent(key('y'), 'root')).toBeNull()
  })

  it('lets list navigation win over the shortcut map', () => {
    // The map is asserted never to claim j/k, so this can only ever confirm the
    // precedence rather than mask a real action.
    expect(paletteKeyIntent(key('j'), 'actions')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('k'), 'actions')).toEqual({ kind: 'prev' })
  })

  it('yields nothing for a letter no action claims', () => {
    expect(paletteKeyIntent(key('q'), 'actions')).toBeNull()
    expect(paletteKeyIntent(key('z'), 'actions')).toBeNull()
  })
})

describe('paletteKeyIntent modifiers', () => {
  it('yields nothing for a modified keypress at any level', () => {
    for (const level of ['root', 'actions', 'sub-list'] as const) {
      expect(paletteKeyIntent(key('ArrowDown', { metaKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('ArrowLeft', { altKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('j', { ctrlKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('s', { metaKey: true }), level)).toBeNull()
    }
  })
})

describe('paletteKeyIntent at a sub-list level', () => {
  it('takes digits 1-9 as a positional pick', () => {
    expect(paletteKeyIntent(key('1'), 'sub-list')).toEqual({ kind: 'pick', index: 0 })
    expect(paletteKeyIntent(key('9'), 'sub-list')).toEqual({ kind: 'pick', index: 8 })
  })

  it('ignores 0 — a tenth slot keyed "0" reads as the first', () => {
    expect(paletteKeyIntent(key('0'), 'sub-list')).toBeNull()
  })

  it('takes no action letters — a nested list is a pick, not a menu of actions', () => {
    expect(paletteKeyIntent(key('s'), 'sub-list')).toBeNull()
    expect(paletteKeyIntent(key('w'), 'sub-list')).toBeNull()
  })

  it('navigates and pops a level like any list-only level', () => {
    expect(paletteKeyIntent(key('j'), 'sub-list')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('Backspace'), 'sub-list')).toEqual({ kind: 'back' })
    expect(paletteKeyIntent(key('Escape'), 'sub-list')).toEqual({ kind: 'close' })
  })
})

describe('digits outside a sub-list', () => {
  it('are ignored in the action list — positional keys were rejected there', () => {
    expect(paletteKeyIntent(key('1'), 'actions')).toBeNull()
    expect(paletteKeyIntent(key('3'), 'actions')).toBeNull()
  })

  it('are ordinary typing at root', () => {
    expect(paletteKeyIntent(key('1'), 'root')).toBeNull()
  })
})

describe('isPaletteHotkey', () => {
  it('is ⌘K or Ctrl-K, either case', () => {
    expect(isPaletteHotkey({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true)
    expect(isPaletteHotkey({ key: 'K', metaKey: false, ctrlKey: true })).toBe(true)
  })

  it('is not a bare k, and not another modified key', () => {
    expect(isPaletteHotkey({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false)
    expect(isPaletteHotkey({ key: 'j', metaKey: true, ctrlKey: false })).toBe(false)
  })
})
