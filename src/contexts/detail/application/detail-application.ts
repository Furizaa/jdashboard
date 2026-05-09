import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { DetailIssue } from '~/kernel'
import {
  DetailNetworkError,
  DetailNotFound,
  DetailUnauthorized,
  type DetailLoadError,
} from './errors'
import type { DetailCachePort, DetailGateway } from './ports'

export type DetailSnapshot = {
  baseUrl: string
  issue: DetailIssue
}

export type DetailApplicationService = {
  loadIssue(key: string): ResultAsync<DetailSnapshot, DetailLoadError>
  refresh(key: string): void
}

export type DetailApplicationDeps = {
  gateway: DetailGateway
  cache: DetailCachePort
}

export function createDetailApplicationService(
  deps: DetailApplicationDeps,
): DetailApplicationService {
  return {
    loadIssue: (key) =>
      ResultAsync.fromPromise(
        deps.gateway.loadIssue(key),
        (e): DetailLoadError =>
          new DetailNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, issue }) =>
            okAsync<DetailSnapshot, DetailLoadError>({ baseUrl, issue }),
          )
          .with({ ok: false, error: { _tag: 'Unauthorized' } }, () =>
            errAsync<DetailSnapshot, DetailLoadError>(new DetailUnauthorized()),
          )
          .with({ ok: false, error: { _tag: 'NotFound' } }, () =>
            errAsync<DetailSnapshot, DetailLoadError>(new DetailNotFound()),
          )
          .exhaustive(),
      ),
    refresh: (key) => deps.cache.invalidateIssue(key),
  }
}
