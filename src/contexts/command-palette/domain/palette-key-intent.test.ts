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

describe('paletteKeyIntent at a list level', () => {
  it('adds j / k navigation where there is no text input to steal them from', () => {
    expect(paletteKeyIntent(key('j'), 'list')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('K'), 'list')).toEqual({ kind: 'prev' })
  })

  it('pops one level on Backspace or ArrowLeft', () => {
    expect(paletteKeyIntent(key('Backspace'), 'list')).toEqual({ kind: 'back' })
    expect(paletteKeyIntent(key('ArrowLeft'), 'list')).toEqual({ kind: 'back' })
  })

  it('keeps the shared arrow / Enter / Escape meanings', () => {
    expect(paletteKeyIntent(key('ArrowDown'), 'list')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('Escape'), 'list')).toEqual({ kind: 'close' })
  })
})

describe('paletteKeyIntent action shortcuts', () => {
  it('resolves a curated letter to its action, at a list level only', () => {
    expect(paletteKeyIntent(key('s'), 'list')).toEqual({ kind: 'action', action: 'change-status' })
    expect(paletteKeyIntent(key('y'), 'list')).toEqual({ kind: 'action', action: 'copy-issue-key' })
    expect(paletteKeyIntent(key('W'), 'list')).toEqual({
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
    expect(paletteKeyIntent(key('j'), 'list')).toEqual({ kind: 'next' })
    expect(paletteKeyIntent(key('k'), 'list')).toEqual({ kind: 'prev' })
  })

  it('yields nothing for a letter no action claims', () => {
    expect(paletteKeyIntent(key('q'), 'list')).toBeNull()
    expect(paletteKeyIntent(key('z'), 'list')).toBeNull()
  })
})

describe('paletteKeyIntent modifiers', () => {
  it('yields nothing for a modified keypress at any level', () => {
    for (const level of ['root', 'list'] as const) {
      expect(paletteKeyIntent(key('ArrowDown', { metaKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('ArrowLeft', { altKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('j', { ctrlKey: true }), level)).toBeNull()
      expect(paletteKeyIntent(key('s', { metaKey: true }), level)).toBeNull()
    }
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
