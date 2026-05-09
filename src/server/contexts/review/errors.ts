import { Schema } from 'effect'
import { Unauthorized } from '../../gateways/gitlab/errors'

export { Unauthorized }

export const GetReviewCardsError = Schema.Union(Unauthorized)
export type GetReviewCardsError = Schema.Schema.Type<typeof GetReviewCardsError>
