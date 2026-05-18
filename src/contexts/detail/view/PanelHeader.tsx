import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { IssuePanelState } from '../view-model'
import { CopyableIssueKey } from './CopyableIssueKey'
import { ExternalLinkButton } from './ExternalLinkButton'
import { IconButton } from './IconButton'
import { OpenMrLink } from './OpenMrLink'
import { ReviewMrButton } from './ReviewMrButton'

type OpenPanel = Exclude<IssuePanelState, { phase: 'closed' }>

type ReadyExtras = {
  jiraUrl: string | null
  copyJiraLink: (() => void) | null
  prevKey: string | null
  nextKey: string | null
}

function readyExtras(panel: OpenPanel): ReadyExtras {
  if (panel.phase !== 'ready') {
    return { jiraUrl: null, copyJiraLink: null, prevKey: null, nextKey: null }
  }
  return {
    jiraUrl: panel.jiraUrl,
    copyJiraLink: panel.copyJiraLink,
    prevKey: panel.prevKey,
    nextKey: panel.nextKey,
  }
}

export function PanelHeader({ panel }: { panel: OpenPanel }) {
  const { jiraUrl, copyJiraLink, prevKey, nextKey } = readyExtras(panel)
  return (
    <header className="border-border bg-surface-1 flex items-center gap-2 border-b px-4 py-3">
      <nav aria-label="Breadcrumb" className="text-ink-subtle flex items-center font-mono text-xs">
        {panel.projectKey !== null && (
          <>
            <span>{panel.projectKey}</span>
            <span className="text-ink-tertiary px-1.5">/</span>
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
        <span className="bg-border mx-0.5 h-4 w-px" aria-hidden />
        <OpenMrLink issueKey={panel.issueKey} />
        <ReviewMrButton issueKey={panel.issueKey} />
        {jiraUrl !== null && <ExternalLinkButton href={jiraUrl}>Open in Jira</ExternalLinkButton>}
        <IconButton aria-label="Close panel" onClick={panel.close}>
          <X size={14} />
        </IconButton>
      </div>
    </header>
  )
}
