import { type MouseEvent } from 'react'
import { testIds } from '~/lib/testids'
import { colorForLabel } from '../domain/hash-color'
import type { TicketCardViewModel } from '../view-model/build-card-view'
import { EpicChip } from './EpicChip'

const MAX_VISIBLE_LABELS = 3

function stopPropagation(event: MouseEvent) {
  event.stopPropagation()
}

export function CardLabels({ view }: { view: TicketCardViewModel }) {
  if (view.epic === null && view.labels.length === 0) return null
  const visible = view.labels.slice(0, MAX_VISIBLE_LABELS)
  const overflow = view.labels.length - visible.length
  return (
    // div wraps interactive children only to stop propagation to the card; not itself actionable
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" onClick={stopPropagation}>
      {view.epic !== null && <EpicChip epic={view.epic} />}
      {visible.map((label) => (
        <span
          key={label}
          data-testid={testIds.labelDot}
          title={label}
          className="inline-flex items-center gap-1.5"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorForLabel(label) }}
          />
          <span className="text-muted-foreground text-[11px] leading-none">{label}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span
          data-testid={testIds.labelOverflowChip}
          className="border-border/60 text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] leading-none"
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
