import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react'
import { StatusPillSelect } from '~/features/status-pill'
import { FixasapRibbon, TypeIcon, colorForLabel, hasFixasapLabel } from '~/features/ticket-card'
import { MrPanelBlock } from '~/features/mr-status'
import { useMrFor, useReviewCards } from '~/coordinator'
import type { DetailIssue } from '~/server/jira'
import { RenderAdf } from './adf'
import { Activity } from './Activity'
import { Relationships } from './Relationships'
import { extractPlainText } from './extract-plain-text'
import { useIssuePanel, type IssuePanelState } from './use-issue-panel'

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
          {panel.phase === 'loading' ? (
            <PanelSkeleton />
          ) : panel.phase === 'error' ? (
            <PanelMessage>{panel.message}</PanelMessage>
          ) : (
            <PanelBody issue={panel.issue} jiraUrl={panel.jiraUrl} onOpen={panel.open} />
          )}
        </div>
      </div>
    </div>
  )
}

function PanelHeader({ panel }: { panel: OpenPanel }) {
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

const COPIED_INDICATOR_MS = 1500

function CopyableIssueKey({ issueKey, onCopy }: { issueKey: string; onCopy: (() => void) | null }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (onCopy === null) {
    return <span className="text-foreground">{issueKey}</span>
  }

  const handleClick = () => {
    onCopy()
    setCopied(true)
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_INDICATOR_MS)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copy Jira URL for ${issueKey}`}
      className="text-foreground decoration-muted-foreground/60 focus-visible:ring-ring rounded underline decoration-dotted underline-offset-[3px] transition-colors hover:decoration-solid focus-visible:ring-1 focus-visible:outline-none"
    >
      {copied ? 'Copied' : issueKey}
    </button>
  )
}

function OpenMrLink({ issueKey }: { issueKey: string }) {
  const authorResult = useMrFor(issueKey)
  const reviewQuery = useReviewCards()
  const authorUrl =
    authorResult.state === 'ready' && authorResult.summary !== null
      ? authorResult.summary.webUrl
      : null
  const reviewUrl = (() => {
    if (authorUrl !== null) return null
    if (reviewQuery.data === undefined || reviewQuery.data.ok !== true) return null
    for (const card of reviewQuery.data.cards) {
      if (card.kind === 'review-real' && card.jira.key === issueKey) return card.webUrl
    }
    return null
  })()
  const href = authorUrl ?? reviewUrl
  if (href === null) return null
  return <ExternalLinkButton href={href}>Open MR</ExternalLinkButton>
}

function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      <span>{children}</span>
      <ExternalLink size={12} />
    </a>
  )
}

function IconButton({
  children,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      {...rest}
    >
      {children}
    </button>
  )
}

function PanelBody({
  issue,
  onOpen,
  jiraUrl,
}: {
  issue: DetailIssue
  onOpen: (key: string) => void
  jiraUrl: string | null
}) {
  const hasDescription = extractPlainText(issue.description).length > 0

  return (
    <div className="grid grid-cols-[1fr_180px] gap-6 p-6">
      <div className="min-w-0">
        <h1 className="text-foreground text-xl leading-tight font-semibold">{issue.summary}</h1>
        <div className="mt-5">
          {hasDescription ? (
            <RenderAdf doc={issue.description} jiraUrl={jiraUrl ?? undefined} />
          ) : (
            <NoDescription />
          )}
        </div>
        <Relationships
          parent={issue.parent}
          subIssues={issue.subIssues}
          links={issue.links}
          onOpen={onOpen}
        />
        <Activity comments={issue.comments} />
      </div>
      <PropertiesRail issue={issue} />
    </div>
  )
}

function NoDescription() {
  return <span className="text-muted-foreground italic">No description</span>
}

function PropertiesRail({ issue }: { issue: DetailIssue }) {
  return (
    <aside className="flex flex-col gap-4 text-xs">
      <Field label="Status">
        <StatusPillSelect issueKey={issue.key} status={issue.statusName} />
      </Field>
      <Field label="Type">
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon type={issue.typeName} />
          <span className="text-foreground">{issue.typeName}</span>
        </span>
      </Field>
      <Field label="Priority">
        <span className="text-foreground">{issue.priorityName ?? '—'}</span>
      </Field>
      <Field label="Assignee">
        <span className="text-foreground">{issue.assigneeName ?? 'Unassigned'}</span>
      </Field>
      <Field label="Reporter">
        <span className="text-foreground">{issue.reporterName ?? '—'}</span>
      </Field>
      <Field label="Labels">
        {issue.labels.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {issue.labels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForLabel(label) }}
                />
                <span className="text-foreground">{label}</span>
              </span>
            ))}
          </div>
        )}
      </Field>
      <MrPanelBlock issueKey={issue.key} />
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_180px] gap-6 p-6">
      <div className="min-w-0 space-y-3">
        <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
        <div className="space-y-2 pt-3">
          <div className="bg-muted h-3 w-full animate-pulse rounded" />
          <div className="bg-muted h-3 w-5/6 animate-pulse rounded" />
          <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="bg-muted h-2 w-12 animate-pulse rounded" />
            <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground p-6 text-sm">{children}</div>
}
