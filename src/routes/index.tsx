import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Board } from '~/contexts/board'
import { IssueDetailPanel } from '~/contexts/detail'
import { AuthGate } from './-auth-gate'
import { Header } from './-header'

type IndexSearch = { issue?: string; notes?: boolean }

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const issue =
      typeof search.issue === 'string' && search.issue.trim() !== '' ? search.issue : undefined
    // Notes pane open state travels in the URL so a card's note badge can deep-link
    // straight into it and a refresh keeps it open. Only meaningful with an issue.
    const notes =
      issue !== undefined && (search.notes === true || search.notes === 'true') ? true : undefined
    return { issue, notes }
  },
})

function HomePage() {
  const { issue, notes } = Route.useSearch()
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyWorkspace, setOnlyWorkspace] = useState(false)
  return (
    <AuthGate>
      <div className="flex h-dvh flex-col">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onlyWorkspace={onlyWorkspace}
          onToggleOnlyWorkspace={() => setOnlyWorkspace((v) => !v)}
        />
        <main className="min-h-0 flex-1">
          <Board searchQuery={searchQuery} onlyWorkspace={onlyWorkspace} />
        </main>
      </div>
      <IssueDetailPanel issueKey={issue ?? null} notesOpen={notes ?? false} />
    </AuthGate>
  )
}
