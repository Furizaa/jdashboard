import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react'
import { StatusPillSelect } from '~/features/status-pill'
import { TypeIcon, colorForLabel } from '~/features/ticket-card'
import { columnForStatus, useBoardIssues } from '~/features/board'
import type { BoardIssue, DetailIssue } from '~/server/jira'
import { useIssue } from './use-issue'
import { RenderAdf } from './adf'
import { Activity } from './Activity'
import { Relationships } from './Relationships'
import { extractPlainText } from './extract-plain-text'

const PROJECT_KEY_RE = /^([A-Z][A-Z0-9]+)-\d+$/

export function IssueDetailPanel({ issueKey }: { issueKey: string | null }) {
  const navigate = useNavigate()

  const close = useCallback(() => {
    navigate({ to: '/', search: {} })
  }, [navigate])

  const open = useCallback(
    (key: string) => {
      navigate({ to: '/', search: { issue: key } })
    },
    [navigate],
  )

  useEffect(() => {
    if (issueKey === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issueKey, close])

  if (issueKey === null) return null

  return <PanelContent issueKey={issueKey} onClose={close} onOpen={open} />
}

function PanelContent({
  issueKey,
  onClose,
  onOpen,
}: {
  issueKey: string
  onClose: () => void
  onOpen: (key: string) => void
}) {
  const issueQuery = useIssue(issueKey)
  const boardQuery = useBoardIssues()

  const issue = issueQuery.data?.ok ? issueQuery.data.issue : null
  const baseUrl = issueQuery.data?.ok ? issueQuery.data.baseUrl : null
  const jiraUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : null

  const projectKey = useMemo(() => {
    const match = PROJECT_KEY_RE.exec(issueKey)
    return match ? (match[1] ?? null) : null
  }, [issueKey])

  const { prevKey, nextKey } = useMemo(() => {
    if (!issue || !boardQuery.data?.ok) return { prevKey: null, nextKey: null }
    const column = columnForStatus(issue.statusName)
    const siblings: BoardIssue[] = boardQuery.data.issues.filter(
      (i) => columnForStatus(i.statusName) === column,
    )
    const idx = siblings.findIndex((i) => i.key === issueKey)
    if (idx === -1) return { prevKey: null, nextKey: null }
    return {
      prevKey: idx > 0 ? siblings[idx - 1]!.key : null,
      nextKey: idx < siblings.length - 1 ? siblings[idx + 1]!.key : null,
    }
  }, [issue, boardQuery.data, issueKey])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={issue ? `${issueKey} — ${issue.summary}` : issueKey}
    >
      <div className="bg-background/40 absolute inset-0 backdrop-blur-[1px]" aria-hidden />
      <div
        className="border-border bg-card relative my-4 mr-4 flex h-[calc(100dvh-2rem)] w-[760px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeader
          issueKey={issueKey}
          projectKey={projectKey}
          jiraUrl={jiraUrl}
          prevKey={prevKey}
          nextKey={nextKey}
          onClose={onClose}
          onOpen={onOpen}
        />
        <div className="flex-1 overflow-y-auto">
          {issueQuery.isPending ? (
            <PanelSkeleton />
          ) : issueQuery.isError ? (
            <PanelMessage>
              Couldn't load issue:{' '}
              {issueQuery.error instanceof Error ? issueQuery.error.message : 'unknown error'}
            </PanelMessage>
          ) : issueQuery.data.ok === false ? (
            <PanelMessage>
              {issueQuery.data.reason === 'unauthorized'
                ? 'Invalid Jira credentials.'
                : 'Issue not found.'}
            </PanelMessage>
          ) : (
            <PanelBody issue={issueQuery.data.issue} onOpen={onOpen} jiraUrl={jiraUrl} />
          )}
        </div>
      </div>
    </div>
  )
}

function PanelHeader({
  issueKey,
  projectKey,
  jiraUrl,
  prevKey,
  nextKey,
  onClose,
  onOpen,
}: {
  issueKey: string
  projectKey: string | null
  jiraUrl: string | null
  prevKey: string | null
  nextKey: string | null
  onClose: () => void
  onOpen: (key: string) => void
}) {
  return (
    <header className="border-border flex items-center gap-2 border-b px-4 py-2.5">
      <nav aria-label="Breadcrumb" className="text-muted-foreground font-mono text-xs">
        {projectKey !== null && (
          <>
            <span>{projectKey}</span>
            <span className="px-1.5">·</span>
          </>
        )}
        <span className="text-foreground">{issueKey}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          aria-label="Previous ticket in column"
          disabled={prevKey === null}
          onClick={() => prevKey && onOpen(prevKey)}
        >
          <ChevronUp size={14} />
        </IconButton>
        <IconButton
          aria-label="Next ticket in column"
          disabled={nextKey === null}
          onClick={() => nextKey && onOpen(nextKey)}
        >
          <ChevronDown size={14} />
        </IconButton>
        {jiraUrl !== null && (
          <a
            href={jiraUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in Jira"
            className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none"
          >
            <ExternalLink size={14} />
          </a>
        )}
        <IconButton aria-label="Close panel" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
    </header>
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
  const hasDescription = useMemo(
    () => extractPlainText(issue.description).length > 0,
    [issue.description],
  )

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
