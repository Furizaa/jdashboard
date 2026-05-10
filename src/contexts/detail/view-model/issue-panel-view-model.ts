import { match, P } from 'ts-pattern'
import type { BoardIssue, DetailIssue, GetIssueResult } from '~/kernel'
import { findSiblings } from '../domain'

const PROJECT_KEY_RE = /^([A-Z][A-Z0-9]+)-\d+$/u

export type IssueQueryView = {
  data: GetIssueResult | undefined
  isPending: boolean
  isError: boolean
  error: Error | undefined
}

export type DeriveInput = {
  issueKey: string | null
  issueQuery: IssueQueryView
  boardIssues: readonly BoardIssue[]
  navigate: (key: string | null) => void
  openInBrowser: (url: string) => void
  copyJiraLinkAndToast: (url: string) => void
}

type OpenFields = {
  issueKey: string
  projectKey: string | null
  close: () => void
  open: (key: string) => void
}

export type IssuePanelState =
  | { phase: 'closed' }
  | (OpenFields & { phase: 'loading' })
  | (OpenFields & { phase: 'error'; message: string })
  | (OpenFields & {
      phase: 'ready'
      issue: DetailIssue
      jiraUrl: string
      jiraBaseUrl: string
      prevKey: string | null
      nextKey: string | null
      /** No-op when jiraUrl is unavailable. */
      openInJira: () => void
      /** Copies and toasts on resolve/reject. */
      copyJiraLink: () => void
    })

function extractProjectKey(issueKey: string): string | null {
  const m = PROJECT_KEY_RE.exec(issueKey)
  return m !== null ? (m[1] ?? null) : null
}

export function derive(input: DeriveInput): IssuePanelState {
  const { issueKey, issueQuery, boardIssues, navigate, openInBrowser, copyJiraLinkAndToast } = input

  if (issueKey === null) return { phase: 'closed' }

  const openFields: OpenFields = {
    issueKey,
    projectKey: extractProjectKey(issueKey),
    close: () => navigate(null),
    open: (key) => navigate(key),
  }

  if (issueQuery.isPending) return { ...openFields, phase: 'loading' }

  return match(issueQuery.data)
    .with(P.nullish, () => {
      const message = issueQuery.error?.message ?? 'unknown error'
      return {
        ...openFields,
        phase: 'error' as const,
        message: `Couldn't load issue: ${message}`,
      }
    })
    .with({ ok: false, error: { _tag: 'Unauthorized' } }, () => ({
      ...openFields,
      phase: 'error' as const,
      message: 'Invalid Jira credentials.',
    }))
    .with({ ok: false, error: { _tag: 'NotFound' } }, () => ({
      ...openFields,
      phase: 'error' as const,
      message: 'Issue not found.',
    }))
    .with({ ok: true }, ({ baseUrl, issue }) => {
      const jiraUrl = `${baseUrl}/browse/${issueKey}`
      const { prevKey, nextKey } = findSiblings(issueKey, issue.statusName, boardIssues)
      return {
        ...openFields,
        phase: 'ready' as const,
        issue,
        jiraUrl,
        jiraBaseUrl: baseUrl,
        prevKey,
        nextKey,
        openInJira: () => openInBrowser(jiraUrl),
        copyJiraLink: () => copyJiraLinkAndToast(jiraUrl),
      }
    })
    .exhaustive()
}
