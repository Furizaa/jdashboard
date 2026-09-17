import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { BoardIssue, WatchlistCandidate } from '~/kernel'
import { WatchlistNetworkError, WatchlistUnauthorized, type WatchlistLoadError } from './errors'
import type { WatchlistGateway } from './ports'

export type WatchlistCardsSnapshot = {
  baseUrl: string
  cards: readonly BoardIssue[]
}

export type CandidatesSnapshot = {
  baseUrl: string
  candidates: readonly WatchlistCandidate[]
}

export type WatchlistApplicationService = {
  loadCards(): ResultAsync<WatchlistCardsSnapshot, WatchlistLoadError>
  search(text: string): ResultAsync<CandidatesSnapshot, WatchlistLoadError>
}

export type WatchlistApplicationDeps = {
  gateway: WatchlistGateway
}

export function createWatchlistApplicationService(
  deps: WatchlistApplicationDeps,
): WatchlistApplicationService {
  return {
    loadCards: () =>
      ResultAsync.fromPromise(
        deps.gateway.loadCards(),
        (e): WatchlistLoadError =>
          new WatchlistNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, cards }) =>
            okAsync<WatchlistCardsSnapshot, WatchlistLoadError>({ baseUrl, cards }),
          )
          .with({ ok: false }, () =>
            errAsync<WatchlistCardsSnapshot, WatchlistLoadError>(new WatchlistUnauthorized()),
          )
          .exhaustive(),
      ),
    search: (text) =>
      ResultAsync.fromPromise(
        deps.gateway.search(text),
        (e): WatchlistLoadError =>
          new WatchlistNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, candidates }) =>
            okAsync<CandidatesSnapshot, WatchlistLoadError>({ baseUrl, candidates }),
          )
          .with({ ok: false }, () =>
            errAsync<CandidatesSnapshot, WatchlistLoadError>(new WatchlistUnauthorized()),
          )
          .exhaustive(),
      ),
  }
}
