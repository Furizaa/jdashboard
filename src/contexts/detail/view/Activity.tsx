import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { DetailIssue } from '~/kernel'
import { RenderAdf } from './adf'

type Comment = DetailIssue['comments'][number]

export function Activity({ comments, jiraBaseUrl }: { comments: Comment[]; jiraBaseUrl: string }) {
  const ordered = useMemo(
    () =>
      comments.toSorted((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()),
    [comments],
  )

  return (
    <section className="mt-10">
      <h2 className="text-ink-tertiary text-[10px] font-medium tracking-[0.06em] uppercase">
        Activity
      </h2>
      <div className="mt-3">
        {ordered.length === 0 ? (
          <span className="text-ink-subtle text-sm">No activity</span>
        ) : (
          <ul className="flex flex-col gap-5">
            {ordered.map((comment) => (
              <li key={comment.id}>
                <CommentRow comment={comment} jiraBaseUrl={jiraBaseUrl} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function CommentRow({ comment, jiraBaseUrl }: { comment: Comment; jiraBaseUrl: string }) {
  const name = comment.authorName ?? 'Unknown user'
  const initial = name.charAt(0).toUpperCase()
  return (
    <article className="flex gap-3">
      <Avatar src={comment.authorAvatarUrl} name={name} initial={initial} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="text-foreground font-medium">{name}</span>
          <RelativeTime iso={comment.created} />
        </div>
        <div className="mt-1.5 text-[13px]">
          <RenderAdf doc={comment.body} jiraBaseUrl={jiraBaseUrl} />
        </div>
      </div>
    </article>
  )
}

function Avatar({ src, name, initial }: { src: string | null; name: string; initial: string }) {
  if (src !== null) {
    return (
      <img
        src={src}
        alt={name}
        className="h-7 w-7 shrink-0 rounded-full"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="bg-surface-2 text-ink-subtle inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
    >
      {initial}
    </span>
  )
}

function RelativeTime({ iso }: { iso: string }) {
  const label = useMemo(() => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${formatDistanceToNow(d)} ago`
  }, [iso])
  return (
    <time dateTime={iso} title={iso} className="text-ink-tertiary">
      {label}
    </time>
  )
}
