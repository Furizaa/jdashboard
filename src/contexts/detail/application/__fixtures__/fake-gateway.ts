import type { GetIssueResult } from '~/kernel'
import type { DetailGateway } from '../ports'

export type FakeDetailGateway = DetailGateway & {
  setResult: (r: GetIssueResult) => void
  setError: (e: Error) => void
  callCount: () => number
  lastKey: () => string | null
}

export function createFakeDetailGateway(): FakeDetailGateway {
  let nextResult: GetIssueResult | null = null
  let nextError: Error | null = null
  let calls = 0
  let lastKeyCalled: string | null = null
  return {
    loadIssue: (key) => {
      calls++
      lastKeyCalled = key
      if (nextError !== null) return Promise.reject(nextError)
      if (nextResult === null) {
        return Promise.reject(new Error('FakeDetailGateway: no result configured'))
      }
      return Promise.resolve(nextResult)
    },
    setResult: (r) => {
      nextResult = r
      nextError = null
    },
    setError: (e) => {
      nextError = e
      nextResult = null
    },
    callCount: () => calls,
    lastKey: () => lastKeyCalled,
  }
}
