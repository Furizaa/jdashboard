import { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useBoardData, useTicket } from '~/dashboard'
import { usePolling } from '~/lib/use-polling'
import type { DetailIssue } from '~/server/jira'
import { findSiblings } from './find-siblings'
import { shouldHandleShortcut } from './should-handle-shortcut'

const POLL_INTERVAL_MS = 60_000
const PROJECT_KEY_RE = /^([A-Z][A-Z0-9]+)-\d+$/

export type IssuePanelDeps = {
  /** key === null closes the panel; otherwise opens the given key. */
  navigateToIssue: (key: string | null) => void
  openInBrowser: (url: string) => void
  copyToClipboard: (text: string) => Promise<void>
  toast: { success: (msg: string) => void; error: (msg: string) => void }
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
      jiraUrl: string | null
      prevKey: string | null
      nextKey: string | null
      /** No-op when jiraUrl is null. */
      openInJira: () => void
      /** No-op when jiraUrl is null. Toasts on resolve/reject. */
      copyJiraLink: () => void
    })

export function useIssuePanel(issueKey: string | null): IssuePanelState {
  const navigate = useNavigate()
  const deps = useMemo<IssuePanelDeps>(
    () => ({
      navigateToIssue: (key) =>
        navigate({ to: '/', search: key === null ? {} : { issue: key } }),
      openInBrowser: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
      copyToClipboard: (text) => navigator.clipboard.writeText(text),
      toast: { success: toast.success, error: toast.error },
    }),
    [navigate],
  )
  return useIssuePanelWithDeps(issueKey, deps)
}

export function useIssuePanelWithDeps(
  issueKey: string | null,
  deps: IssuePanelDeps,
): IssuePanelState {
  const issueQuery = useTicket(issueKey)
  const boardQuery = useBoardData()

  usePolling(() => {
    if (issueKey !== null) issueQuery.refetch()
  }, POLL_INTERVAL_MS)

  useEffect(() => {
    if (issueKey === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      deps.navigateToIssue(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issueKey, deps])

  const issue = issueQuery.data?.ok === true ? issueQuery.data.issue : null
  const baseUrl = issueQuery.data?.ok === true ? issueQuery.data.baseUrl : null
  const jiraUrl =
    baseUrl !== null && issueKey !== null ? `${baseUrl}/browse/${issueKey}` : null

  const projectKey = useMemo(() => {
    if (issueKey === null) return null
    const m = PROJECT_KEY_RE.exec(issueKey)
    return m !== null ? (m[1] ?? null) : null
  }, [issueKey])

  const board = boardQuery.data?.ok === true ? boardQuery.data.issues : []
  const { prevKey, nextKey } = useMemo(() => {
    if (issue === null || issueKey === null) return { prevKey: null, nextKey: null }
    return findSiblings(issueKey, issue.statusName, board)
  }, [issue, issueKey, board])

  useEffect(() => {
    if (issueKey === null) return
    const onKey = (event: KeyboardEvent) => {
      if (!shouldHandleShortcut(event)) return
      const key = event.key.toLowerCase()
      if (key === 'j' || event.key === 'ArrowDown') {
        if (nextKey === null) return
        event.preventDefault()
        deps.navigateToIssue(nextKey)
      } else if (key === 'k' || event.key === 'ArrowUp') {
        if (prevKey === null) return
        event.preventDefault()
        deps.navigateToIssue(prevKey)
      } else if (key === 'o') {
        if (jiraUrl === null) return
        event.preventDefault()
        deps.openInBrowser(jiraUrl)
      } else if (key === 'c') {
        if (jiraUrl === null) return
        event.preventDefault()
        deps.copyToClipboard(jiraUrl).then(
          () => deps.toast.success('Link copied'),
          () => deps.toast.error("Couldn't copy link to clipboard"),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issueKey, prevKey, nextKey, jiraUrl, deps])

  if (issueKey === null) return { phase: 'closed' }

  const openFields: OpenFields = {
    issueKey,
    projectKey,
    close: () => deps.navigateToIssue(null),
    open: (key) => deps.navigateToIssue(key),
  }

  if (issueQuery.isPending) return { ...openFields, phase: 'loading' }
  if (issueQuery.isError) {
    const message =
      issueQuery.error instanceof Error ? issueQuery.error.message : 'unknown error'
    return { ...openFields, phase: 'error', message: `Couldn't load issue: ${message}` }
  }
  if (issueQuery.data.ok === false) {
    const message =
      issueQuery.data.reason === 'unauthorized'
        ? 'Invalid Jira credentials.'
        : 'Issue not found.'
    return { ...openFields, phase: 'error', message }
  }

  return {
    ...openFields,
    phase: 'ready',
    issue: issueQuery.data.issue,
    jiraUrl,
    prevKey,
    nextKey,
    openInJira: () => {
      if (jiraUrl === null) return
      deps.openInBrowser(jiraUrl)
    },
    copyJiraLink: () => {
      if (jiraUrl === null) return
      deps.copyToClipboard(jiraUrl).then(
        () => deps.toast.success('Link copied'),
        () => deps.toast.error("Couldn't copy link to clipboard"),
      )
    },
  }
}
