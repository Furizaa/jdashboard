import { Globe } from 'lucide-react'
import { match } from 'ts-pattern'
import { parseInlineCard } from '../../../domain'

export function InlineCard({ url, jiraBaseUrl }: { url: string; jiraBaseUrl?: string }) {
  const kind = parseInlineCard(url, jiraBaseUrl ?? null)
  return match(kind)
    .with({ _tag: 'JiraIssue' }, ({ issueKey, url: href }) => (
      <JiraIssueChip issueKey={issueKey} url={href} />
    ))
    .with({ _tag: 'PlainUrl' }, ({ url: href, display }) => (
      <PlainUrlChip url={href} display={display} />
    ))
    .exhaustive()
}

function JiraIssueChip({ issueKey, url }: { issueKey: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-sm bg-sky-500/15 px-1 font-mono text-sky-200 hover:bg-sky-500/25"
    >
      {issueKey}
    </a>
  )
}

function PlainUrlChip({ url, display }: { url: string; display: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-muted/40 inline-flex items-center gap-1 rounded-sm px-1 text-sky-400 hover:underline"
    >
      <Globe size={12} aria-hidden />
      <span>{display}</span>
    </a>
  )
}
