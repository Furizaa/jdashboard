import { match } from 'ts-pattern'
import { FixasapRibbon } from '~/widgets/fixasap-ribbon'
import { hasFixasapLabel } from '~/widgets/ticket-card'
import { useIssuePanel } from '../presenter'
import type { IssuePanelState } from '../view-model'
import { PanelBody } from './PanelBody'
import { PanelHeader } from './PanelHeader'
import { PanelMessage } from './PanelMessage'
import { PanelSkeleton } from './PanelSkeleton'

type OpenPanel = Exclude<IssuePanelState, { phase: 'closed' }>

export function IssueDetailPanel({ issueKey }: { issueKey: string | null }) {
  const panel = useIssuePanel(issueKey)
  if (panel.phase === 'closed') return null
  return <Panel panel={panel} />
}

function Panel({ panel }: { panel: OpenPanel }) {
  const issue = panel.phase === 'ready' ? panel.issue : null
  return (
    // outer dialog backdrop: click closes; keyboard close (Escape) is wired via useIssuePanel
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={panel.close}
      role="dialog"
      aria-modal="true"
      aria-label={issue !== null ? `${panel.issueKey} — ${issue.summary}` : panel.issueKey}
    >
      <div className="bg-background/40 absolute inset-0 backdrop-blur-[1px]" aria-hidden />
      {/* inner panel stops backdrop clicks from closing the dialog; not itself actionable */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="border-border bg-card relative my-4 mr-4 flex h-[calc(100dvh-2rem)] w-[760px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {issue !== null && hasFixasapLabel(issue.labels) && <FixasapRibbon size="panel" />}
        <PanelHeader panel={panel} />
        <div className="flex-1 overflow-y-auto">
          {match(panel)
            .with({ phase: 'loading' }, () => <PanelSkeleton />)
            .with({ phase: 'error' }, ({ message }) => <PanelMessage>{message}</PanelMessage>)
            .with({ phase: 'ready' }, (ready) => (
              <PanelBody issue={ready.issue} jiraUrl={ready.jiraUrl} onOpen={ready.open} />
            ))
            .exhaustive()}
        </div>
      </div>
    </div>
  )
}
