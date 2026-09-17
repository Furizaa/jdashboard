import { describe, expect, it } from 'vitest'
import {
  errorMessage,
  initialState,
  isAdding,
  isOpen,
  reduce,
  type Event,
  type State,
} from './watchlist-modal-view-model'

describe('watchlist modal reduce', () => {
  const cases: Array<{ name: string; from: State; event: Event; to: State }> = [
    {
      name: 'open from closed',
      from: { phase: 'closed' },
      event: { type: 'opened' },
      to: { phase: 'open-idle' },
    },
    {
      name: 'close from idle',
      from: { phase: 'open-idle' },
      event: { type: 'closed' },
      to: { phase: 'closed' },
    },
    {
      name: 'addStarted from idle → adding',
      from: { phase: 'open-idle' },
      event: { type: 'addStarted' },
      to: { phase: 'open-adding' },
    },
    {
      name: 'close is blocked while adding',
      from: { phase: 'open-adding' },
      event: { type: 'closed' },
      to: { phase: 'open-adding' },
    },
    {
      name: 'addResolved closes the modal',
      from: { phase: 'open-adding' },
      event: { type: 'addResolved' },
      to: { phase: 'closed' },
    },
    {
      name: 'addRejected surfaces the error message',
      from: { phase: 'open-adding' },
      event: { type: 'addRejected', message: 'nope' },
      to: { phase: 'open-error', message: 'nope' },
    },
    {
      name: 'retry from error re-enters adding',
      from: { phase: 'open-error', message: 'nope' },
      event: { type: 'addStarted' },
      to: { phase: 'open-adding' },
    },
    {
      name: 'close from error closes the modal',
      from: { phase: 'open-error', message: 'nope' },
      event: { type: 'closed' },
      to: { phase: 'closed' },
    },
  ]

  it.each(cases)('$name', ({ from, event, to }) => {
    expect(reduce(from, event)).toEqual(to)
  })

  it('ignores opened while already open', () => {
    expect(reduce({ phase: 'open-idle' }, { type: 'opened' })).toEqual({ phase: 'open-idle' })
  })
})

describe('watchlist modal selectors', () => {
  it('isOpen is true for every non-closed phase', () => {
    expect(isOpen(initialState)).toBe(false)
    expect(isOpen({ phase: 'open-idle' })).toBe(true)
    expect(isOpen({ phase: 'open-adding' })).toBe(true)
    expect(isOpen({ phase: 'open-error', message: 'x' })).toBe(true)
  })

  it('isAdding is true only while adding', () => {
    expect(isAdding({ phase: 'open-adding' })).toBe(true)
    expect(isAdding({ phase: 'open-idle' })).toBe(false)
  })

  it('errorMessage is the message only in the error phase', () => {
    expect(errorMessage({ phase: 'open-error', message: 'x' })).toBe('x')
    expect(errorMessage({ phase: 'open-idle' })).toBeNull()
  })
})
