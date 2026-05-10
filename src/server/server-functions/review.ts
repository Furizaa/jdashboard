import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { GitlabUnauthorized } from '../gateways/gitlab/errors'
import { GitlabGateway } from '../gateways/gitlab/port'
import type { ReviewCard } from '../gateways/gitlab/types'
import { loadReviewCards } from '../contexts/review/application/load-review-cards'
import { ReviewConfigLive } from '../contexts/review/config'
import { LoadReviewCardsError } from '../contexts/review/errors'
import { dieOn } from '../lib/die-on'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

type LoadReviewCardsErrorWire = Schema.Schema.Encoded<typeof LoadReviewCardsError>

export type GetReviewCardsResult = WireResult<
  { readonly baseUrl: string; readonly cards: readonly ReviewCard[] },
  LoadReviewCardsErrorWire
>

const GitlabUserOnlyError = Schema.Union(GitlabUnauthorized)
type GitlabUserOnlyErrorWire = Schema.Schema.Encoded<typeof GitlabUserOnlyError>

export type GetGitlabUserResult = WireResult<
  { readonly username: string; readonly displayName: string },
  GitlabUserOnlyErrorWire
>

const reviewCardsProgram = loadReviewCards.pipe(Effect.provide(ReviewConfigLive))

export const getReviewCards = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetReviewCardsResult> =>
    runWire(reviewCardsProgram, LoadReviewCardsError, 'getReviewCards'),
)

const getGitlabUserProgram = Effect.gen(function* () {
  const gitlab = yield* GitlabGateway
  const me = yield* gitlab.getCurrentUser().pipe(dieOn('NotFound', 'Rejected', 'TransportError'))
  return { username: me.username, displayName: me.displayName }
})

export const getGitlabUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGitlabUserResult> =>
    runWire(getGitlabUserProgram, GitlabUserOnlyError, 'getGitlabUser'),
)
