import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Effect, Layer, Stream } from 'effect'
import { ServerEnv } from '../../runtime/server-env'
import {
  JiraNotFound,
  JiraRejected,
  JiraTransportError,
  JiraUnauthorized,
  MediaNotFound,
  MediaResolutionError,
  type JiraGatewayError,
} from './errors'
import { JiraGateway } from './port'
import type {
  AllowedTransition,
  CreateIssueBody,
  GatewayCreatedIssue,
  JiraUser,
  MediaStream,
  RawDetailedIssue,
  RawSearchResponse,
} from './types'

function basicAuth(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

function parseJiraErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errorMessages?: string[]
      errors?: Record<string, string>
    }
    if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length > 0) {
      return parsed.errorMessages.join(' ')
    }
    if (parsed.errors && typeof parsed.errors === 'object') {
      const values = Object.values(parsed.errors).filter((v): v is string => typeof v === 'string')
      if (values.length > 0) return values.join(' ')
    }
  } catch {
    // fall through
  }
  return body || 'Jira request was rejected'
}

const decodeJsonBody = <T>(
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<T, JiraGatewayError> =>
  response.json.pipe(
    Effect.mapError((error) => new JiraTransportError({ message: error.message })),
  ) as Effect.Effect<T, JiraGatewayError>

const readErrorBody = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string> =>
  response.text.pipe(Effect.catchAll(() => Effect.succeed('')))

const failFromStatus = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, JiraGatewayError> =>
  readErrorBody(response).pipe(
    Effect.flatMap((body) =>
      Effect.fail(new JiraRejected({ message: parseJiraErrorMessage(body) })),
    ),
  )

const mediaResolutionFromStatus = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, MediaResolutionError> =>
  readErrorBody(response).pipe(
    Effect.flatMap((body) =>
      Effect.fail(
        new MediaResolutionError({
          message: parseJiraErrorMessage(body),
          status: response.status,
        }),
      ),
    ),
  )

function decodeMediaBinary(
  ok: HttpClientResponse.HttpClientResponse,
): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> {
  return Effect.sync(() => {
    const mimeType = ok.headers['content-type'] ?? 'application/octet-stream'
    const lengthHeader = ok.headers['content-length']
    const contentLength =
      typeof lengthHeader === 'string' && lengthHeader.length > 0
        ? Number.parseInt(lengthHeader, 10)
        : undefined
    return {
      stream: Stream.toReadableStream(ok.stream),
      mimeType,
      ...(typeof contentLength === 'number' && Number.isFinite(contentLength)
        ? { contentLength }
        : {}),
    }
  })
}

function fetchAttachmentContent(
  client: HttpClient.HttpClient,
  baseUrl: string,
  baseHeaders: Readonly<Record<string, string>>,
  id: string,
): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> {
  const request = HttpClientRequest.get(
    `${baseUrl}/rest/api/3/attachment/content/${encodeURIComponent(id)}?redirect=false`,
  ).pipe(HttpClientRequest.setHeaders(baseHeaders))
  return client.execute(request).pipe(
    Effect.mapError(
      (error) =>
        new MediaResolutionError({
          message: `Jira attachment content request failed: ${error.message}`,
          status: 0,
        }),
    ),
    Effect.flatMap(
      (response): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> =>
        HttpClientResponse.matchStatus(response, {
          '2xx': (ok): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> =>
            decodeMediaBinary(ok),
          404: (): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> =>
            Effect.fail(new MediaNotFound()),
          orElse: (bad): Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound> =>
            mediaResolutionFromStatus(bad),
        }),
    ),
  )
}

export const JiraGatewayLive: Layer.Layer<JiraGateway, never, HttpClient.HttpClient | ServerEnv> =
  Layer.effect(
    JiraGateway,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const env = yield* ServerEnv
      const auth = basicAuth(env.JIRA_EMAIL, env.JIRA_API_TOKEN)
      const baseUrl = env.JIRA_BASE_URL
      const baseHeaders = { Authorization: auth, Accept: 'application/json' }

      const get = (path: string): HttpClientRequest.HttpClientRequest =>
        HttpClientRequest.get(`${baseUrl}${path}`).pipe(HttpClientRequest.setHeaders(baseHeaders))

      const postJson = (
        path: string,
        body: unknown,
      ): Effect.Effect<HttpClientRequest.HttpClientRequest, JiraTransportError> =>
        HttpClientRequest.post(`${baseUrl}${path}`).pipe(
          HttpClientRequest.setHeaders(baseHeaders),
          HttpClientRequest.bodyJson(body),
          Effect.mapError(
            (err) => new JiraTransportError({ message: `Encoding request body failed: ${err}` }),
          ),
        )

      const executeJson = <T>(
        request: HttpClientRequest.HttpClientRequest,
      ): Effect.Effect<T, JiraGatewayError> =>
        client.execute(request).pipe(
          Effect.mapError(
            (error) => new JiraTransportError({ message: `Jira request failed: ${error.message}` }),
          ),
          Effect.flatMap((response) =>
            HttpClientResponse.matchStatus(response, {
              '2xx': (ok) => decodeJsonBody<T>(ok),
              401: (): Effect.Effect<T, JiraGatewayError> => Effect.fail(new JiraUnauthorized()),
              404: (): Effect.Effect<T, JiraGatewayError> => Effect.fail(new JiraNotFound()),
              orElse: (bad): Effect.Effect<T, JiraGatewayError> => failFromStatus(bad),
            }),
          ),
        )

      const executeNoBody = (
        request: HttpClientRequest.HttpClientRequest,
      ): Effect.Effect<void, JiraGatewayError> =>
        client.execute(request).pipe(
          Effect.mapError(
            (error) => new JiraTransportError({ message: `Jira request failed: ${error.message}` }),
          ),
          Effect.flatMap((response) =>
            HttpClientResponse.matchStatus(response, {
              '2xx': (): Effect.Effect<void, JiraGatewayError> => Effect.void,
              401: (): Effect.Effect<void, JiraGatewayError> => Effect.fail(new JiraUnauthorized()),
              404: (): Effect.Effect<void, JiraGatewayError> => Effect.fail(new JiraNotFound()),
              orElse: (bad): Effect.Effect<void, JiraGatewayError> => failFromStatus(bad),
            }),
          ),
        )

      return JiraGateway.of({
        getMyself: () =>
          executeJson<{
            accountId: string
            displayName: string
            avatarUrls: Record<string, string>
          }>(get('/rest/api/3/myself')).pipe(
            Effect.map((me): JiraUser => {
              const avatarUrl =
                me.avatarUrls['48x48'] ?? me.avatarUrls['32x32'] ?? me.avatarUrls['24x24'] ?? ''
              return { accountId: me.accountId, displayName: me.displayName, avatarUrl }
            }),
          ),

        searchIssues: (jql, fields) =>
          postJson('/rest/api/3/search/jql', { jql, fields, maxResults: 100 }).pipe(
            Effect.flatMap((req) => executeJson<RawSearchResponse>(req)),
          ),

        getIssue: (key, fields) => {
          const params = new URLSearchParams({ fields: fields.join(',') })
          return executeJson<RawDetailedIssue>(
            get(`/rest/api/3/issue/${encodeURIComponent(key)}?${params.toString()}`),
          )
        },

        getTransitions: (key) =>
          executeJson<{
            transitions: Array<{ id: string; name: string; to: { name: string } }>
          }>(get(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`)).pipe(
            Effect.map((resp): AllowedTransition[] =>
              resp.transitions.map((t) => ({ id: t.id, name: t.name, toStatusName: t.to.name })),
            ),
          ),

        transitionIssue: (key, transitionId) =>
          postJson(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
            transition: { id: transitionId },
          }).pipe(Effect.flatMap((req) => executeNoBody(req))),

        createIssue: (body: CreateIssueBody) =>
          postJson('/rest/api/3/issue', body).pipe(
            Effect.flatMap((req) => executeJson<{ id: string; key: string; self: string }>(req)),
            Effect.map((created): GatewayCreatedIssue => ({ key: created.key })),
          ),

        streamMedia: (id) => fetchAttachmentContent(client, baseUrl, baseHeaders, id),
      })
    }),
  )
