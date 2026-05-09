import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { ReviewCard } from '~/kernel'
import { ReviewNetworkError, ReviewUnauthorized, type ReviewLoadError } from './errors'
import type { ReviewCachePort, ReviewGateway } from './ports'

export type ReviewSnapshot = {
  baseUrl: string
  cards: readonly ReviewCard[]
}

export type ReviewApplicationService = {
  loadReviewCards(): ResultAsync<ReviewSnapshot, ReviewLoadError>
  refresh(): void
}

export type ReviewApplicationDeps = {
  gateway: ReviewGateway
  cache: ReviewCachePort
}

export function createReviewApplicationService(
  deps: ReviewApplicationDeps,
): ReviewApplicationService {
  return {
    loadReviewCards: () =>
      ResultAsync.fromPromise(
        deps.gateway.loadReviewCards(),
        (e): ReviewLoadError =>
          new ReviewNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, cards }) =>
            okAsync<ReviewSnapshot, ReviewLoadError>({ baseUrl, cards }),
          )
          .with({ ok: false }, () =>
            errAsync<ReviewSnapshot, ReviewLoadError>(new ReviewUnauthorized()),
          )
          .exhaustive(),
      ),
    refresh: () => deps.cache.invalidateReviewCards(),
  }
}
