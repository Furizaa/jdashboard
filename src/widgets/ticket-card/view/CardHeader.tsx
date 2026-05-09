import { match } from 'ts-pattern'
import { type MouseEvent } from 'react'
import { StatusPill, StatusPillSelect } from '~/widgets/status-pill'
import type { TicketCardViewModel } from '../view-model/build-card-view'
import { CardKey } from './CardKey'
import { TypeIcon } from './TypeIcon'

function stopPropagation(event: MouseEvent) {
  event.stopPropagation()
}

export function CardHeader({ view }: { view: TicketCardViewModel }) {
  const issueKeyForPill = match(view.bodyClick)
    .with({ kind: 'open-panel' }, ({ issueKey }) => issueKey)
    .with({ kind: 'open-mr' }, () => '')
    .exhaustive()
  return (
    <div className="flex items-center gap-2">
      {match(view.typeIcon)
        .with({ kind: 'merge-request' }, () => <TypeIcon kind="merge-request" />)
        .with({ kind: 'jira' }, ({ type }) => <TypeIcon type={type} />)
        .exhaustive()}
      <CardKey
        keyDisplay={view.keyDisplay}
        keyClick={view.keyClick}
        keyOpenInJira={view.keyOpenInJira}
      />
      {/* span wraps an interactive child only to stop propagation to the card; not itself actionable */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <span className="ml-auto" onClick={stopPropagation}>
        {view.pill.clickable ? (
          <StatusPillSelect issueKey={issueKeyForPill} status={view.pill.text} align="end" />
        ) : (
          <StatusPill status={view.pill.text} />
        )}
      </span>
    </div>
  )
}
