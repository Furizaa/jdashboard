import { Schema } from 'effect'
import { Unauthorized } from '../../gateways/jira/errors'

export { Unauthorized }

export const LoadBoardError = Schema.Union(Unauthorized)
export type LoadBoardError = Schema.Schema.Type<typeof LoadBoardError>
