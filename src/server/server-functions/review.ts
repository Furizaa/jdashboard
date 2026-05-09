import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { Unauthorized } from '../gateways/gitlab/errors'
import { GitlabGateway } from '../gateways/gitlab/port'
import type { ReviewCard } from '../gateways/gitlab/types'
import {
  getReviewCards as getReviewCardsProgram,
  type GetReviewCardsOk,
} from '../contexts/review/application/get-review-cards'
import { ReviewConfigLive } from '../contexts/review/config'
import { GetReviewCardsError } from '../contexts/review/errors'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

type GetReviewCardsErrorWire = Schema.Schema.Encoded<typeof GetReviewCardsError>

export type GetReviewCardsResult = WireResult<
  { readonly baseUrl: string; readonly cards: readonly ReviewCard[] },
  GetReviewCardsErrorWire
>

export type GetGitlabUserResult =
  | { readonly ok: true; readonly username: string; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'unauthorized' }

const reviewCardsProgram = getReviewCardsProgram.pipe(Effect.provide(ReviewConfigLive))

export const getReviewCards = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetReviewCardsResult> => {
    const wire = await appRuntime.runPromise(toWire(reviewCardsProgram, GetReviewCardsError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getReviewCards: internal error')
    }
    return wire as GetReviewCardsResult
  },
)

const GitlabUserOnlyError = Schema.Union(Unauthorized)

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

export type { GetReviewCardsOk }
