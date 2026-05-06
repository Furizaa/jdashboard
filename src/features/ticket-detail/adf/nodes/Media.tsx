import type { ReactNode } from 'react'

type MediaAttrs = Record<string, string | number | boolean | null> | undefined

export function MediaSingle({ children }: { children: ReactNode }) {
  return <div className="my-2">{children}</div>
}

export function MediaGroup({ children }: { children: ReactNode }) {
  return <div className="my-2 flex flex-wrap gap-2">{children}</div>
}

export function Media({ attrs, jiraUrl }: { attrs: MediaAttrs; jiraUrl?: string }) {
  const url = typeof attrs?.url === 'string' ? attrs.url : null
  const alt = typeof attrs?.alt === 'string' ? attrs.alt : ''
  const width = typeof attrs?.width === 'number' ? attrs.width : undefined
  const height = typeof attrs?.height === 'number' ? attrs.height : undefined

  if (url !== null) {
    return (
      <img
        src={url}
        alt={alt}
        width={width}
        height={height}
        className="border-border max-w-full rounded-md border"
      />
    )
  }

  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
      <span>Media hosted in Jira</span>
      {jiraUrl !== undefined && (
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:underline"
        >
          Open in Jira
        </a>
      )}
    </span>
  )
}
