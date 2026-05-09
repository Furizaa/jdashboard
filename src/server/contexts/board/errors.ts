import { Schema } from 'effect'
import { JiraUnauthorized } from '../../gateways/jira/errors'
import { GitlabUnauthorized } from '../../gateways/gitlab/errors'

export const LoadBoardError = Schema.Union(JiraUnauthorized)
export type LoadBoardError = Schema.Schema.Type<typeof LoadBoardError>

export const LoadMrStatusesError = Schema.Union(GitlabUnauthorized)
export type LoadMrStatusesError = Schema.Schema.Type<typeof LoadMrStatusesError>
