import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'
import { NotFound, Rejected, Unauthorized, type GitlabGatewayError } from './errors'
import { GitlabGateway } from './port'
import type {
  GatewayUser,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
  ReviewerEndpointState,
} from './types'

type WireUser = { username: string; name: string }

type WireMrSummary = {
  iid: number
  title: string
  web_url: string
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft: boolean
  updated_at: string
}

type WireReviewer = {
  username: string
  name: string
  avatar_url?: string | null
}

type WireMrDetail = WireMrSummary & {
  reviewers: WireReviewer[]
  head_pipeline: { status: string } | null
  has_conflicts: boolean
}

type WireNote = {
  author: { username: string }
  resolvable: boolean
  resolved: boolean
  system: boolean
}

type WireDiscussion = {
  id: string
  notes: WireNote[]
}

type WireApprovals = {
  approved_by: Array<{ user: { username: string } }>
}

type WireReviewerWithState = {
  user: {
    username: string
    name: string
    avatar_url?: string | null
  }
  state: ReviewerEndpointState
}

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

const decodeJsonBody = <T>(
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<T, GitlabGatewayError> =>
  response.json.pipe(
    Effect.mapError((error) => new Rejected({ message: error.message })),
  ) as Effect.Effect<T, GitlabGatewayError>

const readErrorBody = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string> =>
  response.text.pipe(Effect.catchAll(() => Effect.succeed('')))

const failFromStatus = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, GitlabGatewayError> =>
  readErrorBody(response).pipe(
    Effect.flatMap((body) => Effect.fail(new Rejected({ message: parseGitlabErrorMessage(body) }))),
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

    const executeJson = <T>(
      request: HttpClientRequest.HttpClientRequest,
    ): Effect.Effect<T, GitlabGatewayError> =>
      client.execute(request).pipe(
        Effect.mapError(
          (error) => new Rejected({ message: `GitLab request failed: ${error.message}` }),
        ),
        Effect.flatMap((response) =>
          HttpClientResponse.matchStatus(response, {
            '2xx': (ok) => decodeJsonBody<T>(ok),
            401: (): Effect.Effect<T, GitlabGatewayError> => Effect.fail(new Unauthorized()),
            404: (): Effect.Effect<T, GitlabGatewayError> => Effect.fail(new NotFound()),
            orElse: (bad): Effect.Effect<T, GitlabGatewayError> => failFromStatus(bad),
          }),
        ),
      )

    return GitlabGateway.of({
      getCurrentUser: () =>
        executeJson<WireUser>(get('/api/v4/user')).pipe(
          Effect.map((u): GatewayUser => ({ username: u.username, displayName: u.name })),
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
          return executeJson<WireMrSummary[]>(
            get(`/api/v4/projects/${projectPath}/merge_requests?${params.toString()}`),
          )
        })
        return Effect.all(requests, { concurrency: 'unbounded' }).pipe(
          Effect.map((results) => results.flat().map(toRawMrSummary)),
        )
      },

      getMr: (iid) =>
        executeJson<WireMrDetail>(
          get(`/api/v4/projects/${projectPath}/merge_requests/${iid}`),
        ).pipe(Effect.map(toRawMrDetail)),

      getMrDiscussions: (iid) => {
        const params = new URLSearchParams({ per_page: '100' })
        return executeJson<WireDiscussion[]>(
          get(
            `/api/v4/projects/${projectPath}/merge_requests/${iid}/discussions?${params.toString()}`,
          ),
        ).pipe(Effect.map((discussions) => discussions.map(toRawDiscussion)))
      },

      getMrApprovals: (iid) =>
        executeJson<WireApprovals>(
          get(`/api/v4/projects/${projectPath}/merge_requests/${iid}/approvals`),
        ).pipe(
          Effect.map(
            (wire): RawApprovals => ({
              approvedUsernames: wire.approved_by.map((a) => a.user.username),
            }),
          ),
        ),

      getMrReviewers: (iid) =>
        executeJson<WireReviewerWithState[]>(
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
