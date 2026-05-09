import { afterEach, describe, expect, it } from 'vitest'
import { shouldHandleShortcut } from './should-handle-shortcut'

function makeEvent(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'j', ...init })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('shouldHandleShortcut', () => {
  it('returns true when no element is focused and no modifiers are held', () => {
    expect(shouldHandleShortcut(makeEvent())).toBe(true)
  })

  it('returns false when metaKey is held', () => {
    expect(shouldHandleShortcut(makeEvent({ metaKey: true }))).toBe(false)
  })

  it('returns false when ctrlKey is held', () => {
    expect(shouldHandleShortcut(makeEvent({ ctrlKey: true }))).toBe(false)
  })

  it('returns false when altKey is held', () => {
    expect(shouldHandleShortcut(makeEvent({ altKey: true }))).toBe(false)
  })

  it('returns false when an <input> has focus', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(shouldHandleShortcut(makeEvent())).toBe(false)
  })

  it('returns false when a <textarea> has focus', () => {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    expect(shouldHandleShortcut(makeEvent())).toBe(false)
  })

  it('returns false when a contenteditable element has focus', () => {
    const div = document.createElement('div')
    div.tabIndex = 0
    document.body.appendChild(div)
    // jsdom does not implement HTMLElement.isContentEditable, so define it
    // explicitly here so the helper exercises the contenteditable branch.
    Object.defineProperty(div, 'isContentEditable', { configurable: true, value: true })
    div.focus()
    expect(shouldHandleShortcut(makeEvent())).toBe(false)
  })

  it('returns true when a non-input HTMLElement (like <button>) has focus', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(shouldHandleShortcut(makeEvent())).toBe(true)
  })
})
