import { Schema } from 'effect'
import { NotFound, Rejected, Unauthorized } from '../../gateways/jira/errors'

export { NotFound, Rejected, Unauthorized }

export const LoadIssueError = Schema.Union(Unauthorized, NotFound)
export type LoadIssueError = Schema.Schema.Type<typeof LoadIssueError>

export const LoadTransitionsError = Schema.Union(Unauthorized, NotFound)
export type LoadTransitionsError = Schema.Schema.Type<typeof LoadTransitionsError>

export const PerformTransitionError = Schema.Union(Unauthorized, Rejected)
export type PerformTransitionError = Schema.Schema.Type<typeof PerformTransitionError>
