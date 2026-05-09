import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { DetailIssue } from '~/kernel'
import { RenderAdf } from './adf'

type Comment = DetailIssue['comments'][number]

export function Activity({ comments }: { comments: Comment[] }) {
  const ordered = useMemo(
    () =>
      comments.toSorted((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()),
    [comments],
  )

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground text-[10px] tracking-wide uppercase">Activity</h2>
      <div className="mt-3">
        {ordered.length === 0 ? (
          <span className="text-muted-foreground text-sm">No activity</span>
        ) : (
          <ul className="flex flex-col gap-5">
            {ordered.map((comment) => (
              <li key={comment.id}>
                <CommentRow comment={comment} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function CommentRow({ comment }: { comment: Comment }) {
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
        <div className="mt-1.5 text-sm">
          <RenderAdf doc={comment.body} />
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
      className="bg-muted text-muted-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
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
    <time dateTime={iso} title={iso} className="text-muted-foreground">
      {label}
    </time>
  )
}
