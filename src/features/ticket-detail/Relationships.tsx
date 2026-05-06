import { useMemo } from 'react'
import type { IssueLink, LinkedIssueRef } from '~/server/jira'
import { TypeIcon } from '~/features/ticket-card'
import { StatusPill } from '~/features/status-pill'

export function Relationships({
  parent,
  subIssues,
  links,
  onOpen,
}: {
  parent: LinkedIssueRef | null
  subIssues: LinkedIssueRef[]
  links: IssueLink[]
  onOpen: (key: string) => void
}) {
  const linkGroups = useMemo(() => groupLinks(links), [links])
  const subProgress = useMemo(() => {
    const done = subIssues.filter((s) => s.statusCategory === 'done').length
    return { done, total: subIssues.length }
  }, [subIssues])

  if (parent === null && subIssues.length === 0 && links.length === 0) return null

  return (
    <div className="mt-8 flex flex-col gap-6">
      {parent !== null && (
        <Section title="Parent">
          <RelationshipRow issue={parent} onOpen={onOpen} />
        </Section>
      )}
      {subIssues.length > 0 && (
        <Section
          title="Sub-issues"
          trailing={<ProgressChip done={subProgress.done} total={subProgress.total} />}
        >
          {subIssues.map((s) => (
            <RelationshipRow key={s.key} issue={s} onOpen={onOpen} />
          ))}
        </Section>
      )}
      {linkGroups.map((group) => (
        <Section key={group.label} title={group.label}>
          {group.items.map((link) => (
            <RelationshipRow key={link.id} issue={link.issue} onOpen={onOpen} />
          ))}
        </Section>
      ))}
    </div>
  )
}

function Section({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-muted-foreground text-[10px] tracking-wide uppercase">{title}</h2>
        {trailing}
      </div>
      <div className="mt-2 flex flex-col">{children}</div>
    </section>
  )
}

function RelationshipRow({
  issue,
  onOpen,
}: {
  issue: LinkedIssueRef
  onOpen: (key: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(issue.key)}
      className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      <TypeIcon type={issue.typeName} />
      <span className="text-muted-foreground shrink-0 font-mono text-xs">{issue.key}</span>
      <span className="text-foreground min-w-0 flex-1 truncate text-sm">{issue.summary}</span>
      <span className="shrink-0 pl-2">
        <StatusPill status={issue.statusName} />
      </span>
    </button>
  )
}

function ProgressChip({ done, total }: { done: number; total: number }) {
  return (
    <span className="border-border/60 text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
      {done}/{total} done
    </span>
  )
}

function groupLinks(links: IssueLink[]): Array<{ label: string; items: IssueLink[] }> {
  const map = new Map<string, IssueLink[]>()
  for (const link of links) {
    const label = capitalize(link.relationship)
    const existing = map.get(label)
    if (existing) existing.push(link)
    else map.set(label, [link])
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
