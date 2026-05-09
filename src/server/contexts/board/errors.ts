import { Schema } from 'effect'
import { Unauthorized as JiraUnauthorized } from '../../gateways/jira/errors'
import { Unauthorized as GitlabUnauthorized } from '../../gateways/gitlab/errors'

export { JiraUnauthorized as Unauthorized }

export const LoadBoardError = Schema.Union(JiraUnauthorized)
export type LoadBoardError = Schema.Schema.Type<typeof LoadBoardError>

export const LoadMrStatusesError = Schema.Union(GitlabUnauthorized)
export type LoadMrStatusesError = Schema.Schema.Type<typeof LoadMrStatusesError>
