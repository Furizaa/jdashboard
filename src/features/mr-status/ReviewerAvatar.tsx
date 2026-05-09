import type { CSSProperties } from 'react'
import { testIds } from '~/lib/testids'
import { REVIEWER_STATE_LABEL, type ReviewerVisualState } from '~/kernel'

const RING_STYLES: Record<ReviewerVisualState, { color: string; style: 'solid' | 'dashed' }> = {
  'gray-dashed': { color: 'var(--color-muted-foreground)', style: 'dashed' },
  'blue-dashed': { color: 'oklch(0.65 0.18 245)', style: 'dashed' },
  'red-solid': { color: 'oklch(0.65 0.22 25)', style: 'solid' },
  'green-solid': { color: 'oklch(0.65 0.18 145)', style: 'solid' },
  'green-dashed': { color: 'oklch(0.65 0.18 145)', style: 'dashed' },
}

export function ReviewerAvatar({
  displayName,
  avatarUrl,
  visualState,
}: {
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}) {
  const ring = RING_STYLES[visualState]
  const style: CSSProperties = {
    outline: `2px ${ring.style} ${ring.color}`,
    outlineOffset: '1px',
  }
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      data-testid={testIds.reviewerAvatar}
      data-visual-state={visualState}
      title={`${displayName} — ${REVIEWER_STATE_LABEL[visualState]}`}
      className="bg-muted text-muted-foreground inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] leading-none font-medium"
      style={style}
    >
      {avatarUrl !== null ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  )
}
