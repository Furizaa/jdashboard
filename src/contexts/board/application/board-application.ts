import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { BoardIssue } from '~/kernel'
import { BoardNetworkError, BoardUnauthorized, type BoardLoadError } from './errors'
import type { BoardCachePort, BoardGateway } from './ports'

export type BoardSnapshot = {
  baseUrl: string
  issues: readonly BoardIssue[]
}

export type BoardApplicationService = {
  loadBoard(): ResultAsync<BoardSnapshot, BoardLoadError>
  refresh(): void
}

export type BoardApplicationDeps = {
  gateway: BoardGateway
  cache: BoardCachePort
}

export function createBoardApplicationService(deps: BoardApplicationDeps): BoardApplicationService {
  return {
    loadBoard: () =>
      ResultAsync.fromPromise(
        deps.gateway.loadBoard(),
        (e): BoardLoadError =>
          new BoardNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, issues }) =>
            okAsync<BoardSnapshot, BoardLoadError>({ baseUrl, issues }),
          )
          .with({ ok: false }, () =>
            errAsync<BoardSnapshot, BoardLoadError>(new BoardUnauthorized()),
          )
          .exhaustive(),
      ),
    refresh: () => deps.cache.invalidateBoard(),
  }
}
