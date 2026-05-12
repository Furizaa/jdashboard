import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMyself } from '~/server/server-functions/capture'
import { cn } from '~/lib/cn'

const TOKEN_PAGE_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'

export function AuthGate({ children }: { children: ReactNode }): ReactNode {
  const query = useQuery({
    queryKey: ['jira', 'myself'],
    queryFn: () => getMyself(),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-ink-subtle text-sm">Checking Jira credentials…</p>
      </div>
    )
  }

  if (query.isError) {
    return (
      <FullScreenMessage
        title="Couldn't reach Jira"
        body={query.error instanceof Error ? query.error.message : 'Unknown error'}
      />
    )
  }

  if (query.data.ok === false) {
    return <InvalidCredentials />
  }

  return children
}

function InvalidCredentials() {
  return (
    <FullScreenMessage
      title="Invalid Jira credentials"
      body={
        <>
          <p>The Jira API rejected the configured token (HTTP 401).</p>
          <p className="mt-2">
            Generate or rotate a token at{' '}
            <a
              href={TOKEN_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              id.atlassian.com/manage-profile/security/api-tokens
            </a>{' '}
            and update{' '}
            <code className="bg-surface-2 rounded px-1.5 py-0.5 font-mono text-xs">.env</code>.
          </p>
        </>
      }
    />
  )
}

function FullScreenMessage({
  title,
  body,
  tone = 'destructive',
}: {
  title: string
  body: ReactNode
  tone?: 'destructive' | 'muted'
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="border-border bg-card max-w-md rounded-lg border p-8">
        <h1
          className={cn(
            'text-xl font-semibold tracking-[-0.015em]',
            tone === 'destructive' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {title}
        </h1>
        <div className="text-ink-subtle mt-3 text-sm leading-relaxed">{body}</div>
      </div>
    </div>
  )
}
