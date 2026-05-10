import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Effect, Layer, Schema } from 'effect'
import { ServerEnv } from '../../runtime/server-env'
import {
  GitlabNotFound,
  GitlabRejected,
  GitlabTransportError,
  GitlabUnauthorized,
  type GitlabGatewayError,
} from './errors'
import { GitlabGateway } from './port'
import type {
  GitlabUser,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
} from './types'

const WireUserSchema = Schema.Struct({
  username: Schema.String,
  name: Schema.String,
})

// GitLab MR `state` is a closed enum from the API; an unknown value should
// fail loudly so we can assess the new state rather than silently accept it.
const WireMrStateSchema = Schema.Literal('opened', 'closed', 'merged', 'locked')

const WireMrSummarySchema = Schema.Struct({
  iid: Schema.Number,
  title: Schema.String,
  web_url: Schema.String,
  state: WireMrStateSchema,
  draft: Schema.Boolean,
  updated_at: Schema.String,
})
type WireMrSummary = Schema.Schema.Type<typeof WireMrSummarySchema>

const WireReviewerSchema = Schema.Struct({
  username: Schema.String,
  name: Schema.String,
  avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
})

// `head_pipeline.status` stays Schema.String — `ciVisualState` already
// handles unknown pipeline statuses gracefully.
const WireMrDetailSchema = Schema.Struct({
  ...WireMrSummarySchema.fields,
  reviewers: Schema.Array(WireReviewerSchema),
  head_pipeline: Schema.NullOr(Schema.Struct({ status: Schema.String })),
  has_conflicts: Schema.Boolean,
})
type WireMrDetail = Schema.Schema.Type<typeof WireMrDetailSchema>

// GitLab omits `resolved` on non-resolvable notes (system notes, plain
// comments). The downstream consumer only reads it when `resolvable` is
// true, so defaulting the missing case to `false` is safe.
const WireNoteSchema = Schema.Struct({
  author: Schema.Struct({ username: Schema.String }),
  resolvable: Schema.Boolean,
  resolved: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  system: Schema.Boolean,
})

const WireDiscussionSchema = Schema.Struct({
  id: Schema.String,
  notes: Schema.Array(WireNoteSchema),
})
type WireDiscussion = Schema.Schema.Type<typeof WireDiscussionSchema>

const WireApprovalsSchema = Schema.Struct({
  approved_by: Schema.Array(Schema.Struct({ user: Schema.Struct({ username: Schema.String }) })),
})

// The reviewer's review-state is a closed enum from the GitLab reviewers
// endpoint; new states should fail loudly so we assess them.
const WireReviewerEndpointStateSchema = Schema.Literal(
  'unreviewed',
  'review_started',
  'reviewed',
  'requested_changes',
  'approved',
)

const WireReviewerWithStateSchema = Schema.Struct({
  user: Schema.Struct({
    username: Schema.String,
    name: Schema.String,
    avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  state: WireReviewerEndpointStateSchema,
})

function toRawMrSummary(wire: WireMrSummary): RawMrSummary {
  return {
    iid: wire.iid,
    title: wire.title,
    webUrl: wire.web_url,
    state: wire.state,
    draft: wire.draft,
    updatedAt: wire.updated_at,
  }
}

function toRawMrDetail(wire: WireMrDetail): RawMrDetail {
  return {
    ...toRawMrSummary(wire),
    reviewers: wire.reviewers.map((r) => ({
      username: r.username,
      displayName: r.name,
      avatarUrl: r.avatar_url ?? null,
    })),
    headPipelineStatus: wire.head_pipeline?.status ?? null,
    hasConflicts: wire.has_conflicts,
  }
}

function toRawDiscussion(wire: WireDiscussion): RawDiscussion {
  return {
    id: wire.id,
    notes: wire.notes.map((n) => ({
      authorUsername: n.author.username,
      resolvable: n.resolvable,
      resolved: n.resolved,
      system: n.system,
    })),
  }
}

function parseGitlabErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      message?: string | string[]
      error?: string
      error_description?: string
    }
    if (typeof parsed.message === 'string') return parsed.message
    if (Array.isArray(parsed.message)) return parsed.message.join(' ')
    if (typeof parsed.error_description === 'string') return parsed.error_description
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    // fall through
  }
  return body || 'GitLab request was rejected'
}

const decodeJsonAs =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (response: HttpClientResponse.HttpClientResponse): Effect.Effect<A, GitlabGatewayError> =>
    HttpClientResponse.schemaBodyJson(schema)(response).pipe(
      Effect.mapError((error) => new GitlabTransportError({ message: error.message })),
    )

const readErrorBody = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string> =>
  response.text.pipe(Effect.catchAll(() => Effect.succeed('')))

const failFromStatus = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, GitlabGatewayError> =>
  readErrorBody(response).pipe(
    Effect.flatMap((body) =>
      Effect.fail(new GitlabRejected({ message: parseGitlabErrorMessage(body) })),
    ),
  )

export const GitlabGatewayLive: Layer.Layer<
  GitlabGateway,
  never,
  HttpClient.HttpClient | ServerEnv
> = Layer.effect(
  GitlabGateway,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const env = yield* ServerEnv
    const baseUrl = env.GITLAB_BASE_URL
    const token = env.GITLAB_TOKEN
    const projectPath = encodeURIComponent(env.GITLAB_PROJECT_PATH)
    const baseHeaders = { 'PRIVATE-TOKEN': token, Accept: 'application/json' }

    const get = (path: string): HttpClientRequest.HttpClientRequest =>
      HttpClientRequest.get(`${baseUrl}${path}`).pipe(HttpClientRequest.setHeaders(baseHeaders))

    const executeJson =
      <A, I>(schema: Schema.Schema<A, I>) =>
      (request: HttpClientRequest.HttpClientRequest): Effect.Effect<A, GitlabGatewayError> =>
        client.execute(request).pipe(
          Effect.mapError(
            (error) =>
              new GitlabTransportError({ message: `GitLab request failed: ${error.message}` }),
          ),
          Effect.flatMap((response) =>
            HttpClientResponse.matchStatus(response, {
              '2xx': (ok): Effect.Effect<A, GitlabGatewayError> => decodeJsonAs(schema)(ok),
              401: (): Effect.Effect<A, GitlabGatewayError> =>
                Effect.fail(new GitlabUnauthorized()),
              404: (): Effect.Effect<A, GitlabGatewayError> => Effect.fail(new GitlabNotFound()),
              orElse: (bad): Effect.Effect<A, GitlabGatewayError> => failFromStatus(bad),
            }),
          ),
        )

    return GitlabGateway.of({
      getCurrentUser: () =>
        executeJson(WireUserSchema)(get('/api/v4/user')).pipe(
          Effect.map((u): GitlabUser => ({ username: u.username, displayName: u.name })),
        ),

      listMrs: (query: ListMrsQuery) => {
        const updatedAfterIso = query.updatedAfter.toISOString()
        const userParam: [string, string] =
          'reviewerUsername' in query
            ? ['reviewer_username', query.reviewerUsername]
            : ['author_username', query.authorUsername]
        const requests = query.states.map((state) => {
          const params = new URLSearchParams({
            state,
            [userParam[0]]: userParam[1],
            updated_after: updatedAfterIso,
            per_page: '100',
            order_by: 'updated_at',
            sort: 'desc',
          })
          return executeJson(Schema.Array(WireMrSummarySchema))(
            get(`/api/v4/projects/${projectPath}/merge_requests?${params.toString()}`),
          )
        })
        return Effect.all(requests, { concurrency: 'unbounded' }).pipe(
          Effect.map((results) => results.flatMap((arr) => arr.map(toRawMrSummary))),
        )
      },

      getMr: (iid) =>
        executeJson(WireMrDetailSchema)(
          get(`/api/v4/projects/${projectPath}/merge_requests/${iid}`),
        ).pipe(Effect.map(toRawMrDetail)),

      getMrDiscussions: (iid) => {
        const params = new URLSearchParams({ per_page: '100' })
        return executeJson(Schema.Array(WireDiscussionSchema))(
          get(
            `/api/v4/projects/${projectPath}/merge_requests/${iid}/discussions?${params.toString()}`,
          ),
        ).pipe(Effect.map((discussions) => discussions.map(toRawDiscussion)))
      },

      getMrApprovals: (iid) =>
        executeJson(WireApprovalsSchema)(
          get(`/api/v4/projects/${projectPath}/merge_requests/${iid}/approvals`),
        ).pipe(
          Effect.map(
            (wire): RawApprovals => ({
              approvedUsernames: wire.approved_by.map((a) => a.user.username),
            }),
          ),
        ),

      getMrReviewers: (iid) =>
        executeJson(Schema.Array(WireReviewerWithStateSchema))(
          get(`/api/v4/projects/${projectPath}/merge_requests/${iid}/reviewers`),
        ).pipe(
          Effect.map((wire): RawMrReviewerWithState[] =>
            wire.map((r) => ({
              username: r.user.username,
              displayName: r.user.name,
              avatarUrl: r.user.avatar_url ?? null,
              state: r.state,
            })),
          ),
        ),
    })
  }),
)
