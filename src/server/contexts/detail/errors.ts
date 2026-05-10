import { Schema } from 'effect'
import {
  JiraNotFound,
  JiraRejected,
  JiraTransportError,
  JiraUnauthorized,
} from '../../gateways/jira/errors'

export const LoadIssueError = Schema.Union(JiraUnauthorized, JiraNotFound)
export type LoadIssueError = Schema.Schema.Type<typeof LoadIssueError>

export const LoadTransitionsError = Schema.Union(JiraUnauthorized, JiraNotFound)
export type LoadTransitionsError = Schema.Schema.Type<typeof LoadTransitionsError>

export const PerformTransitionError = Schema.Union(
  JiraUnauthorized,
  JiraRejected,
  JiraTransportError,
)
export type PerformTransitionError = Schema.Schema.Type<typeof PerformTransitionError>
