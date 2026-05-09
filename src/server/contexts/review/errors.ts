import { Schema } from 'effect'
import { Unauthorized } from '../../gateways/gitlab/errors'

export const GetReviewCardsError = Schema.Union(Unauthorized)
export type GetReviewCardsError = Schema.Schema.Type<typeof GetReviewCardsError>
