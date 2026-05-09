import { Schema } from 'effect'
import { GitlabUnauthorized } from '../../gateways/gitlab/errors'

export const LoadReviewCardsError = Schema.Union(GitlabUnauthorized)
export type LoadReviewCardsError = Schema.Schema.Type<typeof LoadReviewCardsError>
