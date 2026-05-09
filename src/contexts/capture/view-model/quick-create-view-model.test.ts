import { describe, expect, it } from 'vitest'
import {
  initialState,
  isOpen,
  isPending,
  reduce,
  TIMEOUT_MESSAGE,
  type Event,
  type State,
} from './quick-create-view-model'

const CLOSED: State = { phase: 'closed' }
const OPEN_IDLE: State = { phase: 'open-idle' }
const OPEN_PENDING: State = { phase: 'open-pending' }
const OPEN_ERROR: State = { phase: 'open-error', message: 'last failure' }

const REJECTED: Event = { type: 'submitRejected', message: 'rejected reason' }

type Case = {
  from: State
  event: Event
  expect: State
  describe: string
}

const TRANSITIONS: ReadonlyArray<Case> = [
  // closed: only `opened` advances; everything else is a no-op
  {
    from: CLOSED,
    event: { type: 'opened' },
    expect: OPEN_IDLE,
    describe: 'closed + opened → open-idle',
  },
  {
    from: CLOSED,
    event: { type: 'closed' },
    expect: CLOSED,
    describe: 'closed + closed → closed (no-op)',
  },
  {
    from: CLOSED,
    event: { type: 'formSubmitted' },
    expect: CLOSED,
    describe: 'closed + formSubmitted → closed (no-op)',
  },
  {
    from: CLOSED,
    event: { type: 'submitResolved' },
    expect: CLOSED,
    describe: 'closed + submitResolved → closed (no-op)',
  },
  {
    from: CLOSED,
    event: REJECTED,
    expect: CLOSED,
    describe: 'closed + submitRejected → closed (no-op)',
  },
  {
    from: CLOSED,
    event: { type: 'timedOut' },
    expect: CLOSED,
    describe: 'closed + timedOut → closed (no-op)',
  },

  // open-idle: closed → closed; formSubmitted → open-pending; opened ignored
  {
    from: OPEN_IDLE,
    event: { type: 'opened' },
    expect: OPEN_IDLE,
    describe: 'open-idle + opened → open-idle (no-op)',
  },
  {
    from: OPEN_IDLE,
    event: { type: 'closed' },
    expect: CLOSED,
    describe: 'open-idle + closed → closed',
  },
  {
    from: OPEN_IDLE,
    event: { type: 'formSubmitted' },
    expect: OPEN_PENDING,
    describe: 'open-idle + formSubmitted → open-pending',
  },
  {
    from: OPEN_IDLE,
    event: { type: 'submitResolved' },
    expect: OPEN_IDLE,
    describe: 'open-idle + submitResolved → open-idle (no-op)',
  },
  {
    from: OPEN_IDLE,
    event: REJECTED,
    expect: OPEN_IDLE,
    describe: 'open-idle + submitRejected → open-idle (no-op)',
  },
  {
    from: OPEN_IDLE,
    event: { type: 'timedOut' },
    expect: OPEN_IDLE,
    describe: 'open-idle + timedOut → open-idle (no-op)',
  },

  // open-pending: only resolution events; closed/opened/formSubmitted are blocked
  {
    from: OPEN_PENDING,
    event: { type: 'opened' },
    expect: OPEN_PENDING,
    describe: 'open-pending + opened → open-pending (no-op)',
  },
  {
    from: OPEN_PENDING,
    event: { type: 'closed' },
    expect: OPEN_PENDING,
    describe: 'open-pending + closed → open-pending (blocks close while pending)',
  },
  {
    from: OPEN_PENDING,
    event: { type: 'formSubmitted' },
    expect: OPEN_PENDING,
    describe: 'open-pending + formSubmitted → open-pending (blocks double submit)',
  },
  {
    from: OPEN_PENDING,
    event: { type: 'submitResolved' },
    expect: CLOSED,
    describe: 'open-pending + submitResolved → closed',
  },
  {
    from: OPEN_PENDING,
    event: REJECTED,
    expect: { phase: 'open-error', message: 'rejected reason' },
    describe: 'open-pending + submitRejected → open-error with message',
  },
  {
    from: OPEN_PENDING,
    event: { type: 'timedOut' },
    expect: { phase: 'open-error', message: TIMEOUT_MESSAGE },
    describe: 'open-pending + timedOut → open-error with timeout message',
  },

  // open-error: closed → closed; formSubmitted (retry) → open-pending; opened ignored
  {
    from: OPEN_ERROR,
    event: { type: 'opened' },
    expect: OPEN_ERROR,
    describe: 'open-error + opened → open-error (no-op)',
  },
  {
    from: OPEN_ERROR,
    event: { type: 'closed' },
    expect: CLOSED,
    describe: 'open-error + closed → closed',
  },
  {
    from: OPEN_ERROR,
    event: { type: 'formSubmitted' },
    expect: OPEN_PENDING,
    describe: 'open-error + formSubmitted → open-pending (retry)',
  },
  {
    from: OPEN_ERROR,
    event: { type: 'submitResolved' },
    expect: OPEN_ERROR,
    describe: 'open-error + submitResolved → open-error (no-op)',
  },
  {
    from: OPEN_ERROR,
    event: REJECTED,
    expect: OPEN_ERROR,
    describe: 'open-error + submitRejected → open-error (no-op)',
  },
  {
    from: OPEN_ERROR,
    event: { type: 'timedOut' },
    expect: OPEN_ERROR,
    describe: 'open-error + timedOut → open-error (no-op)',
  },
]

describe('quick-create view-model — reduce', () => {
  for (const c of TRANSITIONS) {
    it(c.describe, () => {
      expect(reduce(c.from, c.event)).toEqual(c.expect)
    })
  }
})

describe('quick-create view-model — initialState', () => {
  it('starts closed', () => {
    expect(initialState).toEqual(CLOSED)
  })
})

describe('quick-create view-model — selectors', () => {
  it('isOpen is false only when closed', () => {
    expect(isOpen(CLOSED)).toBe(false)
    expect(isOpen(OPEN_IDLE)).toBe(true)
    expect(isOpen(OPEN_PENDING)).toBe(true)
    expect(isOpen(OPEN_ERROR)).toBe(true)
  })

  it('isPending is true only in open-pending', () => {
    expect(isPending(CLOSED)).toBe(false)
    expect(isPending(OPEN_IDLE)).toBe(false)
    expect(isPending(OPEN_PENDING)).toBe(true)
    expect(isPending(OPEN_ERROR)).toBe(false)
  })
})
