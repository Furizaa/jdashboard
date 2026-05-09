import type { CreateIssueResult, GetMyEpicsResult, QuickCreateInput } from '~/kernel'
import type { CaptureGateway } from '../ports'

export type FakeCaptureGateway = CaptureGateway & {
  setCreateResult: (r: CreateIssueResult) => void
  setCreateError: (e: Error) => void
  setEpicsResult: (r: GetMyEpicsResult) => void
  setEpicsError: (e: Error) => void
  createCallCount: () => number
  epicsCallCount: () => number
  lastCreateInput: () => QuickCreateInput | null
  lastCreateSignal: () => AbortSignal | undefined
}

export function createFakeCaptureGateway(): FakeCaptureGateway {
  let nextCreateResult: CreateIssueResult | null = null
  let nextCreateError: Error | null = null
  let nextEpicsResult: GetMyEpicsResult | null = null
  let nextEpicsError: Error | null = null
  let createCalls = 0
  let epicsCalls = 0
  let lastInput: QuickCreateInput | null = null
  let lastSignal: AbortSignal | undefined
  return {
    createIssue: (input, signal) => {
      createCalls++
      lastInput = input
      lastSignal = signal
      if (nextCreateError !== null) return Promise.reject(nextCreateError)
      if (nextCreateResult === null) {
        return Promise.reject(new Error('FakeCaptureGateway: no createIssue result configured'))
      }
      return Promise.resolve(nextCreateResult)
    },
    loadMyEpics: () => {
      epicsCalls++
      if (nextEpicsError !== null) return Promise.reject(nextEpicsError)
      if (nextEpicsResult === null) {
        return Promise.reject(new Error('FakeCaptureGateway: no loadMyEpics result configured'))
      }
      return Promise.resolve(nextEpicsResult)
    },
    setCreateResult: (r) => {
      nextCreateResult = r
      nextCreateError = null
    },
    setCreateError: (e) => {
      nextCreateError = e
      nextCreateResult = null
    },
    setEpicsResult: (r) => {
      nextEpicsResult = r
      nextEpicsError = null
    },
    setEpicsError: (e) => {
      nextEpicsError = e
      nextEpicsResult = null
    },
    createCallCount: () => createCalls,
    epicsCallCount: () => epicsCalls,
    lastCreateInput: () => lastInput,
    lastCreateSignal: () => lastSignal,
  }
}
