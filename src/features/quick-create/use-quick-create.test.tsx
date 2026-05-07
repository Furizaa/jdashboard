import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  useQuickCreateWithDeps,
  type QuickCreateDeps,
  type QuickCreateState,
} from './use-quick-create'

function fakeDeps(overrides: Partial<QuickCreateDeps> = {}): QuickCreateDeps {
  return {
    submit: vi.fn(() =>
      Promise.resolve({ ok: true as const, key: 'HDR-1', baseUrl: 'https://j.example' }),
    ),
    isPending: false,
    ...overrides,
  }
}

function renderQuickCreate(initialDeps: QuickCreateDeps) {
  return renderHook(
    ({ deps }: { deps: QuickCreateDeps }) => {
      const [open, setOpen] = useState(false)
      const resetRef = useRef<(() => void) | null>(null)
      return useQuickCreateWithDeps(deps, { open, setOpen, resetRef })
    },
    { initialProps: { deps: initialDeps } },
  )
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
  it('returns open: false and isPending: false with deps.submit', () => {
    const submit = vi.fn(() =>
      Promise.resolve({ ok: true as const, key: 'HDR-1', baseUrl: 'https://j.example' }),
    )
    const { result } = renderQuickCreate(fakeDeps({ submit }))
    expect(result.current.open).toBe(false)
    expect(result.current.isPending).toBe(false)
    expect(result.current.submit).toBe(submit)
  })
})

describe('useQuickCreateWithDeps — openModal / closeModal', () => {
  it('openModal() flips open to true', () => {
    const { result } = renderQuickCreate(fakeDeps())
    act(() => result.current.openModal())
    expect(result.current.open).toBe(true)
  })

  it('closeModal() flips open back to false when not pending', () => {
    const { result } = renderQuickCreate(fakeDeps())
    act(() => result.current.openModal())
    act(() => result.current.closeModal())
    expect(result.current.open).toBe(false)
  })

  it('closeModal() is a no-op while isPending', () => {
    const { result, rerender } = renderQuickCreate(fakeDeps())
    act(() => result.current.openModal())
    rerender({ deps: fakeDeps({ isPending: true }) })
    act(() => result.current.closeModal())
    expect(result.current.open).toBe(true)
  })
})

describe('useQuickCreateWithDeps — setOpen guard', () => {
  it('setOpen(true) while isPending applies (only closing is blocked)', () => {
    const { result } = renderQuickCreate(fakeDeps({ isPending: true }))
    act(() => result.current.setOpen(true))
    expect(result.current.open).toBe(true)
  })

  it('setOpen(false) while isPending is a no-op', () => {
    const { result, rerender } = renderQuickCreate(fakeDeps())
    act(() => result.current.setOpen(true))
    rerender({ deps: fakeDeps({ isPending: true }) })
    act(() => result.current.setOpen(false))
    expect(result.current.open).toBe(true)
  })
})

describe('useQuickCreateWithDeps — submit forwards to deps.submit', () => {
  it('submit(input) calls deps.submit and resolves with its return value', async () => {
    const submit = vi.fn(() =>
      Promise.resolve({ ok: true as const, key: 'HDR-9', baseUrl: 'https://j.example' }),
    )
    const { result } = renderQuickCreate(fakeDeps({ submit }))
    const input = { type: 'Bug' as const, parentKey: 'HDR-1', summary: 'Test', description: 'd' }
    let resolved: Awaited<ReturnType<QuickCreateState['submit']>> | undefined
    await act(async () => {
      resolved = await result.current.submit(input)
    })
    expect(submit).toHaveBeenCalledWith(input)
    expect(resolved).toEqual({ ok: true, key: 'HDR-9', baseUrl: 'https://j.example' })
  })
})

describe('useQuickCreateWithDeps — registerReset', () => {
  it('registerReset(spy) stores the callback so it can be invoked later', () => {
    const reset = vi.fn()
    const { result } = renderHook(() => {
      const [open, setOpen] = useState(false)
      const resetRef = useRef<(() => void) | null>(null)
      const qc = useQuickCreateWithDeps(fakeDeps(), { open, setOpen, resetRef })
      return { qc, resetRef }
    })
    act(() => result.current.qc.registerReset(reset))
    result.current.resetRef.current?.()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe("useQuickCreateWithDeps — 'c' global shortcut", () => {
  it("opens the modal when 'c' is pressed and modal is closed and no input is focused", () => {
    const { result } = renderQuickCreate(fakeDeps())
    expect(result.current.open).toBe(false)
    dispatchKey({ key: 'c' })
    expect(result.current.open).toBe(true)
  })

  it("does not re-open when 'c' is pressed while modal is already open", () => {
    const setOpenSpy = vi.fn()
    renderHook(() => {
      const resetRef = useRef<(() => void) | null>(null)
      return useQuickCreateWithDeps(fakeDeps(), {
        open: true,
        setOpen: setOpenSpy,
        resetRef,
      })
    })
    dispatchKey({ key: 'c' })
    expect(setOpenSpy).not.toHaveBeenCalled()
  })

  it("'c' with metaKey held does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    dispatchKey({ key: 'c', metaKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with ctrlKey held does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    dispatchKey({ key: 'c', ctrlKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with altKey held does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    dispatchKey({ key: 'c', altKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' with shiftKey held does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    dispatchKey({ key: 'c', shiftKey: true })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on <input> does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on <textarea> does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on a contenteditable element does not open", () => {
    const { result } = renderQuickCreate(fakeDeps())
    const div = document.createElement('div')
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    document.body.appendChild(div)
    act(() => {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(false)
  })

  it("'c' while focused on a <button> does open (HTMLElement check is restricted to typing controls)", () => {
    const { result } = renderQuickCreate(fakeDeps())
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    })
    expect(result.current.open).toBe(true)
  })
})
