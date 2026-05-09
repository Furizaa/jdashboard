import { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useBoardData, useTicket } from '~/coordinator'
import { usePolling } from '~/lib/use-polling'
import { shouldHandleShortcut } from '../domain'
import { derive, type IssuePanelState } from '../view-model'

const ISSUE_PANEL_POLL_INTERVAL_MS = 60_000

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

  useEffect(() => {
    if (issueKey === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      navigate(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issueKey, navigate])

  const ready = state.phase === 'ready' ? state : null
  const prevKey = ready?.prevKey ?? null
  const nextKey = ready?.nextKey ?? null
  const jiraUrl = ready?.jiraUrl ?? null

  useEffect(() => {
    if (issueKey === null) return
    const onKey = (event: KeyboardEvent) => {
      if (!shouldHandleShortcut(event)) return
      const key = event.key.toLowerCase()
      if (key === 'j' || event.key === 'ArrowDown') {
        if (nextKey === null) return
        event.preventDefault()
        navigate(nextKey)
      } else if (key === 'k' || event.key === 'ArrowUp') {
        if (prevKey === null) return
        event.preventDefault()
        navigate(prevKey)
      } else if (key === 'o') {
        if (jiraUrl === null) return
        event.preventDefault()
        openInBrowser(jiraUrl)
      } else if (key === 'c') {
        if (jiraUrl === null) return
        event.preventDefault()
        copyJiraLinkAndToast(jiraUrl)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issueKey, prevKey, nextKey, jiraUrl, navigate, openInBrowser, copyJiraLinkAndToast])

  return state
}
