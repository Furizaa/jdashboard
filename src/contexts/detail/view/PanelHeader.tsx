import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { IssuePanelState } from '../view-model'
import { CopyableIssueKey } from './CopyableIssueKey'
import { ExternalLinkButton } from './ExternalLinkButton'
import { IconButton } from './IconButton'
import { OpenMrLink } from './OpenMrLink'

type OpenPanel = Exclude<IssuePanelState, { phase: 'closed' }>

export function PanelHeader({ panel }: { panel: OpenPanel }) {
  const jiraUrl = panel.phase === 'ready' ? panel.jiraUrl : null
  const copyJiraLink = panel.phase === 'ready' ? panel.copyJiraLink : null
  const prevKey = panel.phase === 'ready' ? panel.prevKey : null
  const nextKey = panel.phase === 'ready' ? panel.nextKey : null
  return (
    <header className="border-border flex items-center gap-2 border-b px-4 py-2.5">
      <nav aria-label="Breadcrumb" className="text-muted-foreground font-mono text-xs">
        {panel.projectKey !== null && (
          <>
            <span>{panel.projectKey}</span>
            <span className="px-1.5">·</span>
          </>
        )}
        <CopyableIssueKey issueKey={panel.issueKey} onCopy={copyJiraLink} />
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          aria-label="Previous ticket in column"
          disabled={prevKey === null}
          onClick={() => prevKey && panel.open(prevKey)}
        >
          <ChevronUp size={14} />
        </IconButton>
        <IconButton
          aria-label="Next ticket in column"
          disabled={nextKey === null}
          onClick={() => nextKey && panel.open(nextKey)}
        >
          <ChevronDown size={14} />
        </IconButton>
        <OpenMrLink issueKey={panel.issueKey} />
        {jiraUrl !== null && <ExternalLinkButton href={jiraUrl}>Open in Jira</ExternalLinkButton>}
        <IconButton aria-label="Close panel" onClick={panel.close}>
          <X size={14} />
        </IconButton>
      </div>
    </header>
  )
}
