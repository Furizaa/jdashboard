import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { RefineNoteResult, RouteTranscriptResult } from '~/kernel'
import { useBulkRefineWithDeps, type BulkRefineDeps } from './use-bulk-refine'

const targets = [
  { key: 'HDR-1', summary: 'Login timeout', epic: null, labels: [] },
  { key: 'HDR-2', summary: 'Cache layer', epic: null, labels: [] },
]

function fakeDeps(overrides: Partial<BulkRefineDeps> = {}): BulkRefineDeps {
  return {
    targets,
    route: vi.fn(
      (): Promise<RouteTranscriptResult> =>
        Promise.resolve({ ok: true, matches: [{ key: 'HDR-1', brief: 'Drop the cookie.' }] }),
    ),
    refine: vi.fn(
      (): Promise<RefineNoteResult> => Promise.resolve({ ok: true, note: 'rewritten' }),
    ),
    ...overrides,
  }
}

const render = (deps: BulkRefineDeps = fakeDeps()) => renderHook(() => useBulkRefineWithDeps(deps))

describe('useBulkRefineWithDeps — routing (stage 1)', () => {
  it('routes and lands in preview, joining briefs with board summaries', async () => {
    const route = vi.fn(
      (): Promise<RouteTranscriptResult> =>
        Promise.resolve({
          ok: true,
          matches: [
            { key: 'HDR-2', brief: 'Ship behind a flag.' },
            { key: 'HDR-1', brief: 'Drop the cookie.' },
          ],
        }),
    )
    const { result } = render(fakeDeps({ route }))
    act(() => result.current.open())
    act(() => result.current.setTranscript('we discussed the cache and the login'))
    await act(async () => {
      result.current.route()
    })

    expect(route).toHaveBeenCalledWith('we discussed the cache and the login', targets)
    const display = result.current.display
    expect(display).toMatchObject({ open: true, step: 'preview', selectedCount: 2 })
    if (display.open && display.step === 'preview') {
      expect(display.matches).toEqual([
        { key: 'HDR-2', summary: 'Cache layer', brief: 'Ship behind a flag.', selected: true },
        { key: 'HDR-1', summary: 'Login timeout', brief: 'Drop the cookie.', selected: true },
      ])
    }
  })

  it('lands in no-matches when the router returns nothing', async () => {
    const route = vi.fn(() => Promise.resolve<RouteTranscriptResult>({ ok: true, matches: [] }))
    const { result } = render(fakeDeps({ route }))
    act(() => result.current.open())
    act(() => result.current.setTranscript('nothing relevant'))
    await act(async () => {
      result.current.route()
    })
    expect(result.current.display).toMatchObject({ step: 'no-matches' })
  })

  it('lands in route-error, keeping the transcript for a retry', async () => {
    const route = vi.fn(() =>
      Promise.resolve<RouteTranscriptResult>({ ok: false, error: { message: 'agent down' } }),
    )
    const { result } = render(fakeDeps({ route }))
    act(() => result.current.open())
    act(() => result.current.setTranscript('t'))
    await act(async () => {
      result.current.route()
    })
    expect(result.current.display).toMatchObject({
      step: 'route-error',
      message: 'agent down',
      transcript: 't',
    })
  })
})

describe('useBulkRefineWithDeps — applying (stage 2)', () => {
  async function toPreview(deps: BulkRefineDeps) {
    const hook = render(deps)
    act(() => hook.result.current.open())
    act(() => hook.result.current.setTranscript('t'))
    await act(async () => {
      hook.result.current.route()
    })
    return hook
  }

  it('refines each selected ticket and ends in done with an ok count', async () => {
    const refine = vi.fn(() => Promise.resolve<RefineNoteResult>({ ok: true, note: 'n' }))
    const route = vi.fn(() =>
      Promise.resolve<RouteTranscriptResult>({
        ok: true,
        matches: [
          { key: 'HDR-1', brief: 'b1' },
          { key: 'HDR-2', brief: 'b2' },
        ],
      }),
    )
    const { result } = await toPreview(fakeDeps({ route, refine }))

    await act(async () => {
      result.current.apply()
    })
    await waitFor(() => expect(result.current.display).toMatchObject({ step: 'done' }))

    expect(refine).toHaveBeenCalledTimes(2)
    expect(refine).toHaveBeenCalledWith('HDR-1', 'b1')
    expect(refine).toHaveBeenCalledWith('HDR-2', 'b2')
    expect(result.current.display).toMatchObject({ step: 'done', okCount: 2, failCount: 0 })
  })

  it('only refines still-selected tickets and records failures per ticket', async () => {
    const refine = vi.fn((key: string) =>
      key === 'HDR-2'
        ? Promise.resolve<RefineNoteResult>({ ok: false, error: { message: 'boom' } })
        : Promise.resolve<RefineNoteResult>({ ok: true, note: 'n' }),
    )
    const route = vi.fn(() =>
      Promise.resolve<RouteTranscriptResult>({
        ok: true,
        matches: [
          { key: 'HDR-1', brief: 'b1' },
          { key: 'HDR-2', brief: 'b2' },
        ],
      }),
    )
    const { result } = await toPreview(fakeDeps({ route, refine }))

    // Deselect HDR-1, leaving only HDR-2 (which fails).
    act(() => result.current.toggle('HDR-1'))
    await act(async () => {
      result.current.apply()
    })
    await waitFor(() => expect(result.current.display).toMatchObject({ step: 'done' }))

    expect(refine).toHaveBeenCalledTimes(1)
    expect(refine).toHaveBeenCalledWith('HDR-2', 'b2')
    const display = result.current.display
    expect(display).toMatchObject({ step: 'done', okCount: 0, failCount: 1 })
    if (display.open && display.step === 'done') {
      expect(display.items[0]).toMatchObject({ key: 'HDR-2', status: 'failed', error: 'boom' })
    }
  })

  it('does nothing when no ticket is selected', async () => {
    const refine = vi.fn(() => Promise.resolve<RefineNoteResult>({ ok: true, note: 'n' }))
    const { result } = await toPreview(fakeDeps({ refine }))
    act(() => result.current.toggle('HDR-1')) // the only match, now deselected
    act(() => result.current.apply())
    expect(refine).not.toHaveBeenCalled()
    expect(result.current.display).toMatchObject({ step: 'preview' })
  })
})
