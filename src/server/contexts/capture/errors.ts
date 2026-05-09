import { Schema } from 'effect'
import { JiraRejected, JiraUnauthorized } from '../../gateways/jira/errors'

export const QuickCreateError = Schema.Union(JiraUnauthorized, JiraRejected)
export type QuickCreateError = Schema.Schema.Type<typeof QuickCreateError>

export const LoadMyEpicsError = Schema.Union(JiraUnauthorized)
export type LoadMyEpicsError = Schema.Schema.Type<typeof LoadMyEpicsError>

export const LoadMyselfError = Schema.Union(JiraUnauthorized)
export type LoadMyselfError = Schema.Schema.Type<typeof LoadMyselfError>
