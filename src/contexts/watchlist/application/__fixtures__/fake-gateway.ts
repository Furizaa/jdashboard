import type { GetWatchlistCardsResult, SearchWatchlistCandidatesResult } from '~/kernel'
import type { WatchlistGateway } from '../ports'

export type FakeWatchlistGateway = WatchlistGateway & {
  setCards: (r: GetWatchlistCardsResult) => void
  setCandidates: (r: SearchWatchlistCandidatesResult) => void
  setError: (e: Error) => void
  lastSearch: () => string | null
}

export function createFakeWatchlistGateway(): FakeWatchlistGateway {
  let cardsResult: GetWatchlistCardsResult | null = null
  let candidatesResult: SearchWatchlistCandidatesResult | null = null
  let nextError: Error | null = null
  let searchArg: string | null = null
  return {
    loadCards: () => {
      if (nextError !== null) return Promise.reject(nextError)
      if (cardsResult === null) {
        return Promise.reject(new Error('FakeWatchlistGateway: no cards result configured'))
      }
      return Promise.resolve(cardsResult)
    },
    search: (text) => {
      searchArg = text
      if (nextError !== null) return Promise.reject(nextError)
      if (candidatesResult === null) {
        return Promise.reject(new Error('FakeWatchlistGateway: no candidates result configured'))
      }
      return Promise.resolve(candidatesResult)
    },
    setCards: (r) => {
      cardsResult = r
      nextError = null
    },
    setCandidates: (r) => {
      candidatesResult = r
      nextError = null
    },
    setError: (e) => {
      nextError = e
    },
    lastSearch: () => searchArg,
  }
}
