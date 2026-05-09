import { Schema } from 'effect'
import { Rejected, Unauthorized } from '../../gateways/jira/errors'

export { Rejected, Unauthorized }

export const QuickCreateError = Schema.Union(Unauthorized, Rejected)
export type QuickCreateError = Schema.Schema.Type<typeof QuickCreateError>

export const LoadMyEpicsError = Schema.Union(Unauthorized)
export type LoadMyEpicsError = Schema.Schema.Type<typeof LoadMyEpicsError>

export const GetMyselfError = Schema.Union(Unauthorized)
export type GetMyselfError = Schema.Schema.Type<typeof GetMyselfError>
