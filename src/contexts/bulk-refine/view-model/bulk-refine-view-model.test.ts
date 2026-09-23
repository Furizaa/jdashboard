import { describe, expect, it } from 'vitest'
import type { RefineQuestion } from '~/kernel'
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
    const applying: State = { phase: 'applying', items: items('HDR-1'), grills: {}, round: 2 }
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

describe('reduce — gathering (first pass)', () => {
  const gathering = () =>
    run(
      { phase: 'preview', matches: [] },
      { type: 'gatherStarted', items: items('HDR-1', 'HDR-2') },
    )

  const question = (id: string): RefineQuestion => ({
    id,
    title: `Q ${id}`,
    body: '',
    options: [{ id: `${id}-a`, label: 'A', recommended: true }],
    allowFreeText: true,
  })

  it('gatherStarted from preview → gathering with pending items', () => {
    expect(gathering()).toEqual({
      phase: 'gathering',
      round: 1,
      grills: {},
      items: [
        { key: 'HDR-1', summary: 'HDR-1 summary', status: 'pending' },
        { key: 'HDR-2', summary: 'HDR-2 summary', status: 'pending' },
      ],
    })
  })

  it('gatherStarted with no items is a no-op', () => {
    const preview: State = { phase: 'preview', matches: [] }
    expect(reduce(preview, { type: 'gatherStarted', items: [] })).toBe(preview)
  })

  it('marks a ticket refining then noted, leaving the other pending', () => {
    const state = run(
      gathering(),
      { type: 'ticketStarted', key: 'HDR-1' },
      { type: 'ticketNoted', key: 'HDR-1' },
    )
    expect(state).toMatchObject({
      phase: 'gathering',
      items: [
        { key: 'HDR-1', status: 'done' },
        { key: 'HDR-2', status: 'pending' },
      ],
    })
  })

  it('records a failure message on the failed ticket', () => {
    const state = reduce(gathering(), { type: 'ticketFailed', key: 'HDR-2', message: 'nope' })
    expect(state).toMatchObject({
      phase: 'gathering',
      items: [
        { key: 'HDR-1', status: 'pending' },
        { key: 'HDR-2', status: 'failed', error: 'nope' },
      ],
    })
  })

  it('a ticket that asks becomes awaiting and lands in the grills map', () => {
    const state = reduce(gathering(), {
      type: 'ticketAsked',
      key: 'HDR-1',
      summary: 'HDR-1 summary',
      brief: 'b1',
      questions: [question('owner')],
    })
    expect(state).toMatchObject({ phase: 'gathering' })
    if (state.phase === 'gathering') {
      expect(state.items.find((i) => i.key === 'HDR-1')?.status).toBe('awaiting')
      expect(state.grills['HDR-1']).toMatchObject({ key: 'HDR-1', brief: 'b1', priorAnswers: [] })
    }
  })

  it('passSettled with no questions → done', () => {
    const state = run(
      gathering(),
      { type: 'ticketNoted', key: 'HDR-1' },
      { type: 'ticketNoted', key: 'HDR-2' },
      { type: 'passSettled' },
    )
    expect(state).toMatchObject({ phase: 'done' })
  })

  it('passSettled with an awaiting ticket → questions review', () => {
    const state = run(
      gathering(),
      { type: 'ticketNoted', key: 'HDR-1' },
      {
        type: 'ticketAsked',
        key: 'HDR-2',
        summary: 'HDR-2 summary',
        brief: 'b2',
        questions: [question('scope')],
      },
      { type: 'passSettled' },
    )
    expect(state).toMatchObject({ phase: 'questions', round: 1 })
  })
})

describe('reduce — questions review + applying', () => {
  const question: RefineQuestion = {
    id: 'owner',
    title: 'Who owns it?',
    body: '',
    options: [{ id: 'ada', label: 'Ada', recommended: true }],
    allowFreeText: true,
  }

  // A gathering pass where HDR-1 is done and HDR-2 asked a question.
  const toQuestions = (): State =>
    run(
      { phase: 'preview', matches: [] },
      { type: 'gatherStarted', items: items('HDR-1', 'HDR-2') },
      { type: 'ticketNoted', key: 'HDR-1' },
      {
        type: 'ticketAsked',
        key: 'HDR-2',
        summary: 'HDR-2 summary',
        brief: 'b2',
        questions: [question],
      },
      { type: 'passSettled' },
    )

  it('records an answer draft against the awaiting ticket', () => {
    const answers = [{ questionId: 'owner', optionId: 'ada' }]
    const state = reduce(toQuestions(), { type: 'answersChanged', key: 'HDR-2', answers })
    if (state.phase === 'questions') {
      expect(state.grills['HDR-2']?.answers).toEqual(answers)
    }
  })

  it('applyStarted folds the resolved answers into priorAnswers and re-runs the awaiting ticket', () => {
    const state = reduce(toQuestions(), {
      type: 'applyStarted',
      resolved: { 'HDR-2': [{ question: 'Who owns it?', answer: 'Ada' }] },
    })
    expect(state).toMatchObject({ phase: 'applying', round: 2 })
    if (state.phase === 'applying') {
      // The already-done ticket stays done; the awaiting one is refining again.
      expect(state.items.find((i) => i.key === 'HDR-1')?.status).toBe('done')
      expect(state.items.find((i) => i.key === 'HDR-2')?.status).toBe('refining')
      expect(state.grills['HDR-2']?.priorAnswers).toEqual([
        { question: 'Who owns it?', answer: 'Ada' },
      ])
    }
  })

  it('a second-round note finishes the ticket and passSettled → done', () => {
    const applying = reduce(toQuestions(), {
      type: 'applyStarted',
      resolved: { 'HDR-2': [{ question: 'Who owns it?', answer: 'Ada' }] },
    })
    const state = run(applying, { type: 'ticketNoted', key: 'HDR-2' }, { type: 'passSettled' })
    expect(state).toMatchObject({ phase: 'done', items: expect.any(Array) })
    if (state.phase === 'done') {
      expect(state.items.every((i) => i.status === 'done')).toBe(true)
    }
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
      round: 2,
      grills: {},
      items: [
        { key: 'A', summary: 'A', status: 'done' },
        { key: 'B', summary: 'B', status: 'failed', error: 'e' },
        { key: 'C', summary: 'C', status: 'refining' },
      ],
    })
    expect(display).toMatchObject({ step: 'applying', finishedCount: 2, total: 3 })
  })

  it('questions: lists only awaiting tickets and counts the already-refined', () => {
    const grill = {
      key: 'B',
      summary: 'B',
      brief: 'b',
      questions: [{ id: 'q', title: 'T', body: '', options: [], allowFreeText: true }],
      answers: [],
      priorAnswers: [],
    }
    const display = deriveBulkRefine({
      phase: 'questions',
      round: 1,
      grills: { B: grill },
      items: [
        { key: 'A', summary: 'A', status: 'done' },
        { key: 'B', summary: 'B', status: 'awaiting' },
      ],
    })
    expect(display).toMatchObject({ step: 'questions', settledCount: 1 })
    if (display.open && display.step === 'questions') {
      expect(display.grills).toEqual([grill])
    }
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
  it('is true only while an agent run is in flight', () => {
    expect(isBusy({ phase: 'routing', transcript: 't' })).toBe(true)
    expect(isBusy({ phase: 'gathering', items: [], grills: {}, round: 1 })).toBe(true)
    expect(isBusy({ phase: 'applying', items: [], grills: {}, round: 2 })).toBe(true)
    expect(isBusy({ phase: 'input', transcript: 't' })).toBe(false)
    expect(isBusy({ phase: 'preview', matches: [] })).toBe(false)
    expect(isBusy({ phase: 'questions', items: [], grills: {}, round: 1 })).toBe(false)
  })
})
