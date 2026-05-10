import { match } from 'ts-pattern'
import { FixasapRibbon } from '~/widgets/fixasap-ribbon'
import { hasFixasapLabel } from '~/widgets/ticket-card'
import { LightboxOpenProvider, useIssuePanel } from '../presenter'
import type { IssuePanelState } from '../view-model'
import { PanelBody } from './PanelBody'
import { PanelHeader } from './PanelHeader'
import { PanelMessage } from './PanelMessage'
import { PanelSkeleton } from './PanelSkeleton'

type OpenPanel = Exclude<IssuePanelState, { phase: 'closed' }>

export function IssueDetailPanel({ issueKey }: { issueKey: string | null }) {
  return (
    <LightboxOpenProvider>
      <IssueDetailPanelInner issueKey={issueKey} />
    </LightboxOpenProvider>
  )
}

function IssueDetailPanelInner({ issueKey }: { issueKey: string | null }) {
  const panel = useIssuePanel(issueKey)
  if (panel.phase === 'closed') return null
  return <Panel panel={panel} />
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

function Panel({ panel }: { panel: OpenPanel }) {
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
      <div className="bg-background/40 absolute inset-0 backdrop-blur-[1px]" aria-hidden />
      {/* inner panel stops backdrop clicks from closing the dialog; not itself actionable */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="border-border bg-card relative my-4 mr-4 flex h-[calc(100dvh-2rem)] w-[760px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {showFixasap && <FixasapRibbon size="panel" />}
        <PanelHeader panel={panel} />
        <div className="flex-1 overflow-y-auto">
          <PanelContent panel={panel} />
        </div>
      </div>
    </div>
  )
}
