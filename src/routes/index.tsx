import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/features/auth-status'
import { Board } from '~/features/board'
import { IssueDetailPanel } from '~/features/ticket-detail'

type IndexSearch = { issue?: string }

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const issue =
      typeof search.issue === 'string' && search.issue.trim() !== '' ? search.issue : undefined
    return { issue }
  },
})

function HomePage() {
  const { issue } = Route.useSearch()
  return (
    <AuthGate>
      <Board />
      <IssueDetailPanel issueKey={issue ?? null} />
    </AuthGate>
  )
}
