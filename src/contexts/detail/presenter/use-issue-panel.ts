import { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useBoardData, useTicket } from '~/coordinator'
import { usePolling } from '~/lib/use-polling'
import { panelKeyIntent, shouldHandleShortcut, type PanelKeyIntent } from '../domain'
import { derive, type IssuePanelState } from '../view-model'

const ISSUE_PANEL_POLL_INTERVAL_MS = 60_000

type ShortcutTargets = {
  prevKey: string | null
  nextKey: string | null
  jiraUrl: string | null
  navigate: (key: string | null) => void
  openInBrowser: (url: string) => void
  copyJiraLinkAndToast: (url: string) => void
}

function runIfNotNull<T>(value: T | null, fn: (value: T) => void): boolean {
  if (value === null) return false
  fn(value)
  return true
}

function dispatchPanelIntent(intent: PanelKeyIntent, t: ShortcutTargets): boolean {
  if (intent === 'next') return runIfNotNull(t.nextKey, t.navigate)
  if (intent === 'prev') return runIfNotNull(t.prevKey, t.navigate)
  if (intent === 'open') return runIfNotNull(t.jiraUrl, t.openInBrowser)
  return runIfNotNull(t.jiraUrl, t.copyJiraLinkAndToast)
}

function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose])
}

function useShortcutTargets(
  state: IssuePanelState,
  navigate: (key: string | null) => void,
  openInBrowser: (url: string) => void,
  copyJiraLinkAndToast: (url: string) => void,
): ShortcutTargets {
  const prevKey = state.phase === 'ready' ? state.prevKey : null
  const nextKey = state.phase === 'ready' ? state.nextKey : null
  const jiraUrl = state.phase === 'ready' ? state.jiraUrl : null
  return useMemo(
    () => ({ prevKey, nextKey, jiraUrl, navigate, openInBrowser, copyJiraLinkAndToast }),
    [prevKey, nextKey, jiraUrl, navigate, openInBrowser, copyJiraLinkAndToast],
  )
}

function usePanelShortcuts(active: boolean, targets: ShortcutTargets): void {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (!shouldHandleShortcut(event)) return
      const intent = panelKeyIntent(event)
      if (intent === null) return
      if (dispatchPanelIntent(intent, targets)) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, targets])
}

export function useIssuePanel(issueKey: string | null): IssuePanelState {
  const navigateFn = useNavigate()
  const issueQuery = useTicket(issueKey)
  const boardQuery = useBoardData()

  usePolling(() => {
    if (issueKey !== null) issueQuery.refetch()
  }, ISSUE_PANEL_POLL_INTERVAL_MS)

  const navigate = useMemo(
    () => (key: string | null) =>
      navigateFn({ to: '/', search: key === null ? {} : { issue: key } }),
    [navigateFn],
  )

  const openInBrowser = useMemo(
    () => (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    [],
  )

  const copyJiraLinkAndToast = useMemo(
    () => (url: string) => {
      navigator.clipboard.writeText(url).then(
        () => toast.success('Link copied'),
        () => toast.error("Couldn't copy link to clipboard"),
      )
    },
    [],
  )

  const boardIssues =
    boardQuery.data !== undefined && boardQuery.data.ok === true ? boardQuery.data.issues : []

  const state = derive({
    issueKey,
    issueQuery: {
      data: issueQuery.data,
      isPending: issueQuery.isPending,
      isError: issueQuery.isError,
      error: issueQuery.error instanceof Error ? issueQuery.error : undefined,
    },
    boardIssues,
    navigate,
    openInBrowser,
    copyJiraLinkAndToast,
  })

  const targets = useShortcutTargets(state, navigate, openInBrowser, copyJiraLinkAndToast)

  const closeOnEscape = useMemo(() => () => navigate(null), [navigate])
  useEscapeToClose(issueKey !== null, closeOnEscape)
  usePanelShortcuts(issueKey !== null, targets)

  return state
}
