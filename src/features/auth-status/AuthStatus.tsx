import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMyself } from '~/server/jira'
import { cn } from '~/lib/cn'

const TOKEN_PAGE_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'

export function AuthStatus() {
  const query = useQuery({
    queryKey: ['jira', 'myself'],
    queryFn: () => getMyself(),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">Checking Jira credentials…</p>
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

  const result = query.data
  if (result.ok === false) {
    return <InvalidCredentials />
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
        {result.user.avatarUrl ? (
          <img
            src={result.user.avatarUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-full"
          />
        ) : (
          <div className="bg-muted size-10 rounded-full" />
        )}
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Authenticated as
          </p>
          <p className="text-foreground text-base font-medium">{result.user.displayName}</p>
        </div>
      </div>
    </div>
  )
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
            and update <code className="bg-muted rounded px-1 py-0.5 text-xs">.env</code>.
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
      <div className="border-border bg-card max-w-md rounded-xl border p-6 shadow-lg">
        <h1
          className={cn(
            'text-xl font-semibold',
            tone === 'destructive' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {title}
        </h1>
        <div className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</div>
      </div>
    </div>
  )
}
