import { describe, expect, it } from 'vitest'
import {
  deriveBulkRefine,
  initialState,
  isBusy,
  reduce,
  type ApplyItem,
  type Event,
  type State,
} from './bulk-refine-view-model'

const run = (state: State, ...events: Event[]): State => events.reduce(reduce, state)

const items = (...keys: string[]): ApplyItem[] =>
  keys.map((key) => ({ key, summary: `${key} summary`, status: 'pending' }))

describe('reduce — open/close/input', () => {
  it('opens from closed into an empty input step', () => {
    expect(reduce(initialState, { type: 'opened' })).toEqual({ phase: 'input', transcript: '' })
  })

  it('captures transcript text in the input step', () => {
    const state = run(initialState, { type: 'opened' }, { type: 'setTranscript', transcript: 'hi' })
    expect(state).toEqual({ phase: 'input', transcript: 'hi' })
  })

  it('closes from a settled step and resets to closed', () => {
    const state = run(initialState, { type: 'opened' }, { type: 'closed' })
    expect(state).toEqual({ phase: 'closed' })
  })

  it('blocks close while routing or applying', () => {
    const routing: State = { phase: 'routing', transcript: 't' }
    expect(reduce(routing, { type: 'closed' })).toBe(routing)
    const applying: State = { phase: 'applying', items: items('HDR-1') }
    expect(reduce(applying, { type: 'closed' })).toBe(applying)
  })
})

describe('reduce — routing', () => {
  const toRouting = () =>
    run(
      initialState,
      { type: 'opened' },
      { type: 'setTranscript', transcript: 't' },
      {
        type: 'routeStarted',
      },
    )

  it('enters routing carrying the transcript', () => {
    expect(toRouting()).toEqual({ phase: 'routing', transcript: 't' })
  })

  it('routed with matches → preview, all selected by default', () => {
    const state = reduce(toRouting(), {
      type: 'routed',
      matches: [{ key: 'HDR-1', summary: 'S1', brief: 'B1' }],
    })
    expect(state).toEqual({
      phase: 'preview',
      matches: [{ key: 'HDR-1', summary: 'S1', brief: 'B1', selected: true }],
    })
  })

  it('routed with no matches → no-matches', () => {
    expect(reduce(toRouting(), { type: 'routed', matches: [] })).toEqual({ phase: 'no-matches' })
  })

  it('routeFailed → route-error keeping the transcript', () => {
    expect(reduce(toRouting(), { type: 'routeFailed', message: 'boom' })).toEqual({
      phase: 'route-error',
      transcript: 't',
      message: 'boom',
    })
  })

  it('re-routes from route-error (edit transcript then retry)', () => {
    const err: State = { phase: 'route-error', transcript: 'old', message: 'boom' }
    const state = run(err, { type: 'setTranscript', transcript: 'new' }, { type: 'routeStarted' })
    expect(state).toEqual({ phase: 'routing', transcript: 'new' })
  })
})

describe('reduce — preview selection', () => {
  const preview = (): State => ({
    phase: 'preview',
    matches: [
      { key: 'HDR-1', summary: 'S1', brief: 'B1', selected: true },
      { key: 'HDR-2', summary: 'S2', brief: 'B2', selected: true },
    ],
  })

  it('toggles one ticket off without touching the others', () => {
    const state = reduce(preview(), { type: 'toggled', key: 'HDR-1' })
    expect(state).toMatchObject({
      phase: 'preview',
      matches: [
        { key: 'HDR-1', selected: false },
        { key: 'HDR-2', selected: true },
      ],
    })
  })
})

describe('reduce — applying', () => {
  const applying = () =>
    run({ phase: 'preview', matches: [] }, { type: 'applyStarted', items: items('HDR-1', 'HDR-2') })

  it('applyStarted from preview → applying with pending items', () => {
    expect(applying()).toEqual({
      phase: 'applying',
      items: [
        { key: 'HDR-1', summary: 'HDR-1 summary', status: 'pending' },
        { key: 'HDR-2', summary: 'HDR-2 summary', status: 'pending' },
      ],
    })
  })

  it('applyStarted with no items is a no-op', () => {
    const preview: State = { phase: 'preview', matches: [] }
    expect(reduce(preview, { type: 'applyStarted', items: [] })).toBe(preview)
  })

  it('marks a ticket refining then done, leaving the other pending', () => {
    const state = run(
      applying(),
      { type: 'ticketStarted', key: 'HDR-1' },
      { type: 'ticketFinished', key: 'HDR-1', ok: true },
    )
    expect(state).toMatchObject({
      phase: 'applying',
      items: [
        { key: 'HDR-1', status: 'done' },
        { key: 'HDR-2', status: 'pending' },
      ],
    })
  })

  it('records a failure message on the failed ticket', () => {
    const state = reduce(applying(), {
      type: 'ticketFinished',
      key: 'HDR-2',
      ok: false,
      message: 'nope',
    })
    expect(state).toMatchObject({
      phase: 'applying',
      items: [
        { key: 'HDR-1', status: 'pending' },
        { key: 'HDR-2', status: 'failed', error: 'nope' },
      ],
    })
  })

  it('applyFinished → done with the same items', () => {
    const state = reduce(applying(), { type: 'applyFinished' })
    expect(state).toMatchObject({ phase: 'done' })
  })
})

describe('deriveBulkRefine', () => {
  it('input: canRoute only when transcript is non-blank', () => {
    expect(deriveBulkRefine({ phase: 'input', transcript: '   ' })).toMatchObject({
      canRoute: false,
    })
    expect(deriveBulkRefine({ phase: 'input', transcript: 'x' })).toMatchObject({ canRoute: true })
  })

  it('preview: counts selected and gates apply', () => {
    const display = deriveBulkRefine({
      phase: 'preview',
      matches: [
        { key: 'HDR-1', summary: 'S', brief: 'B', selected: true },
        { key: 'HDR-2', summary: 'S', brief: 'B', selected: false },
      ],
    })
    expect(display).toMatchObject({ step: 'preview', selectedCount: 1, canApply: true })
  })

  it('applying: finished count excludes pending/refining', () => {
    const display = deriveBulkRefine({
      phase: 'applying',
      items: [
        { key: 'A', summary: 'A', status: 'done' },
        { key: 'B', summary: 'B', status: 'failed', error: 'e' },
        { key: 'C', summary: 'C', status: 'refining' },
      ],
    })
    expect(display).toMatchObject({ step: 'applying', finishedCount: 2, total: 3 })
  })

  it('done: splits ok and fail counts', () => {
    const display = deriveBulkRefine({
      phase: 'done',
      items: [
        { key: 'A', summary: 'A', status: 'done' },
        { key: 'B', summary: 'B', status: 'failed', error: 'e' },
      ],
    })
    expect(display).toMatchObject({ step: 'done', okCount: 1, failCount: 1 })
  })

  it('closed renders nothing', () => {
    expect(deriveBulkRefine(initialState)).toEqual({ open: false })
  })
})

describe('isBusy', () => {
  it('is true only while routing or applying', () => {
    expect(isBusy({ phase: 'routing', transcript: 't' })).toBe(true)
    expect(isBusy({ phase: 'applying', items: [] })).toBe(true)
    expect(isBusy({ phase: 'input', transcript: 't' })).toBe(false)
    expect(isBusy({ phase: 'preview', matches: [] })).toBe(false)
  })
})
