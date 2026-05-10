import { useState, type ReactNode } from 'react'
import { Play } from 'lucide-react'
import { MediaLightbox } from './MediaLightbox'
import { MediaUnavailable } from './MediaUnavailable'

type MediaAttrs = Record<string, string | number | boolean | null> | undefined

export function MediaSingle({ children }: { children: ReactNode }) {
  return <div className="my-2">{children}</div>
}

export function MediaGroup({ children }: { children: ReactNode }) {
  return <div className="my-2 flex flex-wrap gap-2">{children}</div>
}

export function Media({ attrs, jiraBaseUrl }: { attrs: MediaAttrs; jiraBaseUrl?: string }) {
  const url = typeof attrs?.url === 'string' ? attrs.url : null
  const alt = typeof attrs?.alt === 'string' ? attrs.alt : ''
  const mimeType = typeof attrs?.mimeType === 'string' ? attrs.mimeType : ''

  if (url === null) {
    return (
      <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
        <span>Media hosted in Jira</span>
        {jiraBaseUrl !== undefined && (
          <a
            href={jiraBaseUrl}
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

  const kind: 'image' | 'video' = mimeType.startsWith('video/') ? 'video' : 'image'
  return <MediaPreview kind={kind} url={url} alt={alt} jiraBaseUrl={jiraBaseUrl} />
}

function MediaPreview({
  kind,
  url,
  alt,
  jiraBaseUrl,
}: {
  kind: 'image' | 'video'
  url: string
  alt: string
  jiraBaseUrl?: string
}) {
  const [open, setOpen] = useState(false)
  const [errored, setErrored] = useState(false)

  if (errored) return <MediaUnavailable jiraBaseUrl={jiraBaseUrl} />

  // For images, the inner <img alt> supplies the button's accessible name so
  // existing tests that locate the image by role+alt continue to work; the
  // explicit aria-label is the fallback when alt is empty (and always for
  // video, since <video> has no inherent accessible name).
  const ariaLabel = kind === 'video' || alt === '' ? (alt !== '' ? alt : 'View media') : undefined
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className="border-border focus-visible:ring-ring relative inline-block max-w-full cursor-zoom-in overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
      >
        {kind === 'image' ? (
          <img src={url} alt={alt} className="block max-w-full" onError={() => setErrored(true)} />
        ) : (
          <>
            <video
              src={url}
              preload="metadata"
              muted
              className="block max-w-full"
              onError={() => setErrored(true)}
            >
              <track kind="captions" />
            </video>
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-black/30"
            >
              <span className="rounded-full bg-black/60 p-3 text-white">
                <Play className="size-6 fill-current" />
              </span>
            </span>
          </>
        )}
      </button>
      <MediaLightbox
        kind={kind}
        url={url}
        alt={alt}
        jiraBaseUrl={jiraBaseUrl}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
