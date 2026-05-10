import { Context, type Effect } from 'effect'
import type { JiraGatewayError, MediaNotFound, MediaResolutionError } from './errors'
import type {
  AllowedTransition,
  CreateIssueBody,
  GatewayCreatedIssue,
  JiraUser,
  MediaStream,
  RawDetailedIssue,
  RawSearchResponse,
} from './types'

export type JiraGatewayShape = {
  readonly getMyself: () => Effect.Effect<JiraUser, JiraGatewayError>
  readonly searchIssues: (
    jql: string,
    fields: readonly string[],
  ) => Effect.Effect<RawSearchResponse, JiraGatewayError>
  readonly getIssue: (
    key: string,
    fields: readonly string[],
  ) => Effect.Effect<RawDetailedIssue, JiraGatewayError>
  readonly getTransitions: (key: string) => Effect.Effect<AllowedTransition[], JiraGatewayError>
  readonly transitionIssue: (
    key: string,
    transitionId: string,
  ) => Effect.Effect<void, JiraGatewayError>
  readonly createIssue: (
    body: CreateIssueBody,
  ) => Effect.Effect<GatewayCreatedIssue, JiraGatewayError>
  readonly streamMedia: (
    id: string,
  ) => Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound>
}

export class JiraGateway extends Context.Tag('JiraGateway')<JiraGateway, JiraGatewayShape>() {}
