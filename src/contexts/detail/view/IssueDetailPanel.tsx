import { match } from 'ts-pattern'
import { FixasapRibbon } from '~/widgets/fixasap-ribbon'
import { hasFixasapLabel } from '~/widgets/ticket-card'
import { cn } from '~/lib/cn'
import { LightboxOpenProvider, useIssuePanel, type AiModal } from '../presenter'
import type { IssuePanelState } from '../view-model'
import { NotesPanel } from './NotesPanel'
import { PanelBody } from './PanelBody'
import { PanelHeader } from './PanelHeader'
import { PanelMessage } from './PanelMessage'
import { PanelSkeleton } from './PanelSkeleton'

type OpenPanel = Exclude<IssuePanelState, { phase: 'closed' }>

export type IssueDetailPanelProps = {
  issueKey: string | null
  notesOpen: boolean
  /** A deep-linked AI modal to open once on arrival (the palette's `r` / `a`). */
  aiModal: AiModal | null
  onAiModalConsumed: () => void
}

export function IssueDetailPanel(props: IssueDetailPanelProps) {
  return (
    <LightboxOpenProvider>
      <IssueDetailPanelInner {...props} />
    </LightboxOpenProvider>
  )
}

function IssueDetailPanelInner({
  issueKey,
  notesOpen,
  aiModal,
  onAiModalConsumed,
}: IssueDetailPanelProps) {
  const panel = useIssuePanel(issueKey, notesOpen)
  if (panel.phase === 'closed') return null
  return <Panel panel={panel} aiModal={aiModal} onAiModalConsumed={onAiModalConsumed} />
}

function panelLabel(panel: OpenPanel): string {
  if (panel.phase !== 'ready') return panel.issueKey
  return `${panel.issueKey} — ${panel.issue.summary}`
}

function PanelContent({ panel }: { panel: OpenPanel }) {
  return match(panel)
    .with({ phase: 'loading' }, () => <PanelSkeleton />)
    .with({ phase: 'error' }, ({ message }) => <PanelMessage>{message}</PanelMessage>)
    .with({ phase: 'ready' }, (ready) => (
      <PanelBody issue={ready.issue} jiraBaseUrl={ready.jiraBaseUrl} onOpen={ready.open} />
    ))
    .exhaustive()
}

function Panel({
  panel,
  aiModal,
  onAiModalConsumed,
}: {
  panel: OpenPanel
  aiModal: AiModal | null
  onAiModalConsumed: () => void
}) {
  // Notes mode widens the dialog to near-full width and reveals the note editor
  // as a left column; the ticket detail keeps its 760px column on the right,
  // unchanged. Open state lives in the URL (`?notes=1`) so a card's note badge can
  // deep-link into it — see `useIssuePanel`.
  const notesOpen = panel.notesOpen
  const showFixasap = panel.phase === 'ready' && hasFixasapLabel(panel.issue.labels)
  // Clicks on the dialog backdrop close the panel. React-synthetic events
  // bubble through portals (e.g. nested MediaLightbox), so the handler ignores
  // any click whose DOM target isn't a descendant of this element.
  const onBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.currentTarget instanceof Node &&
      event.target instanceof Node &&
      !event.currentTarget.contains(event.target)
    ) {
      return
    }
    panel.close()
  }
  return (
    // outer dialog backdrop: click closes; keyboard close (Escape) is wired via useIssuePanel
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={panelLabel(panel)}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" aria-hidden />
      {/* inner panel stops backdrop clicks from closing the dialog; not itself actionable */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className={cn(
          'border-border bg-card relative my-4 mr-4 flex h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border',
          notesOpen ? 'w-[calc(100vw-2rem)]' : 'w-[760px]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {notesOpen && (
          <NotesPanel
            issueKey={panel.issueKey}
            aiModal={aiModal}
            onAiModalConsumed={onAiModalConsumed}
          />
        )}
        <div
          className={cn(
            'relative flex h-full min-w-0 flex-col',
            notesOpen ? 'border-border w-[760px] max-w-full border-l' : 'w-full',
          )}
        >
          {showFixasap && <FixasapRibbon size="panel" />}
          <PanelHeader
            panel={panel}
            notesOpen={notesOpen}
            onToggleNotes={() => panel.setNotesOpen(!notesOpen)}
          />
          <div className="flex-1 overflow-y-auto">
            <PanelContent panel={panel} />
          </div>
        </div>
      </div>
    </div>
  )
}
