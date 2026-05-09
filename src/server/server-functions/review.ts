import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { GitlabUnauthorized } from '../gateways/gitlab/errors'
import { GitlabGateway } from '../gateways/gitlab/port'
import type { ReviewCard } from '../gateways/gitlab/types'
import { loadReviewCards } from '../contexts/review/application/load-review-cards'
import { ReviewConfigLive } from '../contexts/review/config'
import { LoadReviewCardsError } from '../contexts/review/errors'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

type LoadReviewCardsErrorWire = Schema.Schema.Encoded<typeof LoadReviewCardsError>

export type GetReviewCardsResult = WireResult<
  { readonly baseUrl: string; readonly cards: readonly ReviewCard[] },
  LoadReviewCardsErrorWire
>

export type GetGitlabUserResult =
  | { readonly ok: true; readonly username: string; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'unauthorized' }

const reviewCardsProgram = loadReviewCards.pipe(Effect.provide(ReviewConfigLive))

export const getReviewCards = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetReviewCardsResult> => {
    const wire = await appRuntime.runPromise(toWire(reviewCardsProgram, LoadReviewCardsError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getReviewCards: internal error')
    }
    return wire as GetReviewCardsResult
  },
)

const GitlabUserOnlyError = Schema.Union(GitlabUnauthorized)

const getGitlabUserProgram = Effect.gen(function* () {
  const gitlab = yield* GitlabGateway
  const me = yield* gitlab.getCurrentUser().pipe(
    Effect.catchTags({
      NotFound: (e) => Effect.die(e),
      Rejected: (e) => Effect.die(e),
    }),
  )
  return { username: me.username, displayName: me.displayName }
})

export const getGitlabUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGitlabUserResult> => {
    const wire = await appRuntime.runPromise(toWire(getGitlabUserProgram, GitlabUserOnlyError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getGitlabUser: internal error')
    }
    if (wire.ok) {
      return { ok: true, username: wire.username, displayName: wire.displayName }
    }
    return { ok: false, reason: 'unauthorized' }
  },
)
