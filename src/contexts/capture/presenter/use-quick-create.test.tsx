import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useQuickCreateWithDeps, type QuickCreateDeps } from './use-quick-create'

function fakeDeps(overrides: Partial<QuickCreateDeps> = {}): QuickCreateDeps {
  return {
    submit: vi.fn(() =>
      Promise.resolve({ ok: true as const, key: 'HDR-1', baseUrl: 'https://j.example' }),
    ),
    ...overrides,
  }
}

function renderQuickCreate(deps: QuickCreateDeps = fakeDeps()) {
  return renderHook(() => useQuickCreateWithDeps(deps))
}

function dispatchKey(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', init))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useQuickCreateWithDeps — initial state', () => {
  it('starts closed and not pending', () => {
    const { result } = renderQuickCreate()
    expect(result.current.open).toBe(false)
    expect(result.current.isPending).toBe(false)
  })
})

describe('useQuickCreateWithDeps — openModal / closeModal', () => {
  it('openModal() opens the modal', () => {
    const { result } = renderQuickCreate()
    act(() => result.current.openModal())
    expect(result.current.open).toBe(true)
    expect(result.current.isPending).toBe(false)
  })

  it('closeModal() closes the modal from open-idle', () => {
    const { result } = renderQuickCreate()
    act(() => result.current.openModal())
    act(() => result.current.closeModal())
    expect(result.current.open).toBe(false)
  })
})

describe('useQuickCreateWithDeps — submit drives state machine', () => {
  it('flows open-idle → open-pending → closed on success and resets the form', async () => {
    const reset = vi.fn()
    const submit = vi.fn(() =>
      Promise.resolve({ ok: true as const, key: 'HDR-9', baseUrl: 'https://j.example' }),
    )
    const { result } = renderQuickCreate(fakeDeps({ submit }))
    act(() => result.current.openModal())
    act(() => result.current.registerReset(reset))

    const input = {
      type: 'Bug' as const,
      parentKey: 'HDR-1',
      summary: 'Test',
      description: 'd',
    }
    let resolved: Awaited<ReturnType<typeof result.current.submit>> | undefined
    await act(async () => {
      resolved = await result.current.submit(input)
    })
    expect(submit).toHaveBeenCalledWith(input)
    expect(resolved).toEqual({ ok: true, key: 'HDR-9', baseUrl: 'https://j.example' })
    expect(reset).toHaveBeenCalledTimes(1)
    expect(result.current.open).toBe(false)
    expect(result.current.isPending).toBe(false)
  })

  it('lands in open-error on rejected; does not reset the form; closeModal still works', async () => {
    const reset = vi.fn()
    const submit = vi.fn(() =>
      Promise.resolve({ ok: false as const, reason: 'rejected' as const, message: 'no' }),
    )
    const { result } = renderQuickCreate(fakeDeps({ submit }))
    act(() => result.current.openModal())
    act(() => result.current.registerReset(reset))

    await act(async () => {
      await result.current.submit({
        type: 'Bug',
        parentKey: 'HDR-1',
        summary: 'Test',
        description: 'd',
      })
    })
    expect(reset).not.toHaveBeenCalled()
    expect(result.current.open).toBe(true)
    expect(result.current.isPending).toBe(false)

    act(() => result.current.closeModal())
    expect(result.current.open).toBe(false)
  })

  it('lands in open-error on timed-out', async () => {
    const submit = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        reason: 'timed-out' as const,
        message: 'Request timed out',
      }),
    )
    const { result } = renderQuickCreate(fakeDeps({ submit }))
    act(() => result.current.openModal())
    await act(async () => {
      await result.current.submit({
        type: 'Bug',
        parentKey: 'HDR-1',
        summary: 'Test',
        description: 'd',
      })
    })
    expect(result.current.open).toBe(true)
    expect(result.current.isPending).toBe(false)
  })
})

describe("useQuickCreateWithDeps — 'c' global shortcut", () => {
  it("opens the modal when 'c' is pressed and modal is closed and no input is focused", () => {
    const { result } = renderQuickCreate()
    expect(result.current.open).toBe(false)
    dispatchKey({ key: 'c' })
    expect(result.current.open).toBe(true)
  })

  it("does not re-open when 'c' is pressed while modal is already open", () => {
    const { result } = renderQuickCreate()
    act(() => result.current.openModal())
    expect(result.current.open).toBe(true)
    dispatchKey({ key: 'c' })
    expect(result.current.open).toBe(true)
  })

  it("'c' with metaKey held does not open", () => {
    const { result } = renderQuickCreate()
    dispatchKey({ key: 'c', metaKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with ctrlKey held does not open", () => {
    const { result } = renderQuickCreate()
    dispatchKey({ key: 'c', ctrlKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with altKey held does not open", () => {
    const { result } = renderQuickCreate()
    dispatchKey({ key: 'c', altKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with shiftKey held does not open", () => {
    const { result } = renderQuickCreate()
    dispatchKey({ key: 'c', shiftKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on <input> does not open", () => {
    const { result } = renderQuickCreate()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on <textarea> does not open", () => {
    const { result } = renderQuickCreate()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on a contenteditable element does not open", () => {
    const { result } = renderQuickCreate()
    const div = document.createElement('div')
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    document.body.appendChild(div)
    act(() => {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on a <button> does open (HTMLElement check is restricted to typing controls)", () => {
    const { result } = renderQuickCreate()
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(true)
  })
})
