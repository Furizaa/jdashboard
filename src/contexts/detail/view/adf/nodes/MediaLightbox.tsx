import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { useRegisterLightbox } from '../../../presenter'
import { MediaUnavailable } from './MediaUnavailable'

type MediaLightboxProps = {
  kind: 'image' | 'video'
  url: string
  alt?: string
  jiraBaseUrl?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MediaLightbox({
  kind,
  url,
  alt,
  jiraBaseUrl,
  open,
  onOpenChange,
}: MediaLightboxProps) {
  useRegisterLightbox(open)
  const [errored, setErrored] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-background/90 grid h-[95vh] w-[95vw] max-w-[95vw] place-items-center overflow-hidden p-0 sm:max-w-[95vw]"
        aria-label={alt ?? 'Media preview'}
      >
        <DialogTitle className="sr-only">{alt ?? 'Media preview'}</DialogTitle>
        {errored ? (
          <MediaUnavailable jiraBaseUrl={jiraBaseUrl} />
        ) : kind === 'image' ? (
          <img
            src={url}
            alt={alt ?? ''}
            className="max-h-full max-w-full object-contain"
            onError={() => setErrored(true)}
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            muted
            preload="auto"
            className="max-h-full max-w-full"
            onError={() => setErrored(true)}
          >
            <track kind="captions" />
          </video>
        )}
      </DialogContent>
    </Dialog>
  )
}
