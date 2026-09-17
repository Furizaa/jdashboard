import { match } from 'ts-pattern'
import { type MouseEvent } from 'react'
import { Eye, NotebookPen, TerminalSquare } from 'lucide-react'
import { StatusPill, StatusPillSelect } from '~/widgets/status-pill'
import { testIds } from '~/lib/testids'
import type { TicketCardViewModel } from '../view-model/build-card-view'
import { CardKey } from './CardKey'
import { TypeIcon } from './TypeIcon'

function stopPropagation(event: MouseEvent) {
  event.stopPropagation()
}

export function CardHeader({
  view,
  workspaceOpen,
  hasNote,
  onOpenNotes,
}: {
  view: TicketCardViewModel
  workspaceOpen: boolean
  hasNote: boolean
  onOpenNotes: () => void
}) {
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
      {workspaceOpen && <CardWorkspaceBadge />}
      {view.tint === 'watchlist' && <CardWatchlistBadge />}
      {hasNote && <CardNotesBadge onOpenNotes={onOpenNotes} />}
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

// This ticket is on the user's watchlist (advisory — not assigned to them).
// Rendered inline beside the key; the card also carries the epic-purple tint.
function CardWatchlistBadge() {
  return (
    <span
      data-testid={testIds.watchlistBadge}
      title="On your watchlist"
      aria-label="On your watchlist"
      className="inline-flex shrink-0 items-center text-purple-400"
    >
      <Eye size={13} />
    </span>
  )
}

// This ticket has a private local note. Clicking deep-links into the panel with
// the notes pane already open (`?notes=1`); `stopPropagation` keeps the card's own
// body click (which would open the panel without notes) from also firing. Unlike
// the watchlist/workspace badges it carries no card tint — notes are common and a
// tint per note would drown out the watchlist and workspace tints.
function CardNotesBadge({ onOpenNotes }: { onOpenNotes: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpenNotes()
      }}
      data-testid={testIds.noteBadge}
      title="Open notes"
      aria-label="Open notes"
      className="focus-visible:ring-ring inline-flex shrink-0 items-center rounded text-amber-400 transition-colors hover:text-amber-300 focus-visible:ring-2 focus-visible:outline-none"
    >
      <NotebookPen size={13} />
    </button>
  )
}

// A cmux workspace is open for this ticket (its key appears in a workspace
// name). Rendered inline beside the key; the card also carries a blue tint.
function CardWorkspaceBadge() {
  return (
    <span
      data-testid={testIds.workspaceBadge}
      title="Workspace open"
      aria-label="Workspace open"
      className="text-primary inline-flex shrink-0 items-center"
    >
      <TerminalSquare size={13} />
    </span>
  )
}
