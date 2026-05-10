import { createFileRoute } from '@tanstack/react-router'
import { Effect } from 'effect'
import { match, P } from 'ts-pattern'
import { MediaNotFound, MediaResolutionError } from '~/server/gateways/jira/errors'
import { JiraGateway } from '~/server/gateways/jira/port'
import type { MediaStream } from '~/server/gateways/jira/types'
import { appRuntime } from '~/server/runtime/app-runtime'

const TEXT_PLAIN = { 'Content-Type': 'text/plain' } as const

function successResponse(media: MediaStream): Response {
  const headers: Record<string, string> = { 'Content-Type': media.mimeType }
  if (typeof media.contentLength === 'number') {
    headers['Content-Length'] = media.contentLength.toString()
  }
  return new Response(media.stream, { status: 200, headers })
}

function errorResponse(error: MediaNotFound | MediaResolutionError): Response {
  return match(error)
    .with(
      { _tag: 'MediaNotFound' },
      () => new Response('Media not found', { status: 404, headers: TEXT_PLAIN }),
    )
    .with(
      { _tag: 'MediaResolutionError', status: P.union(401, 403) },
      () => new Response('Upstream auth error', { status: 502, headers: TEXT_PLAIN }),
    )
    .with(
      { _tag: 'MediaResolutionError' },
      () => new Response('Upstream error', { status: 502, headers: TEXT_PLAIN }),
    )
    .exhaustive()
}

export const Route = createFileRoute('/api/jira-media/$id')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const program = JiraGateway.pipe(
          Effect.flatMap((jira) => jira.streamMedia(params.id)),
          Effect.match({
            onSuccess: successResponse,
            onFailure: errorResponse,
          }),
          Effect.catchAllDefect((defect) =>
            Effect.sync(() => {
              console.error('[api/jira-media] Unhandled defect:', defect)
              return new Response('Internal error', {
                status: 500,
                headers: TEXT_PLAIN,
              })
            }),
          ),
        )
        return appRuntime.runPromise(program)
      },
    },
  },
})
