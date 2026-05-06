import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/features/auth-status'
import { Board } from '~/features/board'
import { Header } from '~/features/header'
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
  const [searchQuery, setSearchQuery] = useState('')
  return (
    <AuthGate>
      <div className="flex h-dvh flex-col">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className="min-h-0 flex-1">
          <Board searchQuery={searchQuery} />
        </main>
      </div>
      <IssueDetailPanel issueKey={issue ?? null} />
    </AuthGate>
  )
}
