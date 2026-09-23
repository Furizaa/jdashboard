import { createFileRoute } from '@tanstack/react-router'
import { AppShell, validateBoardSearch } from './-app-shell'

export const Route = createFileRoute('/watchlist')({
  component: WatchlistPage,
  validateSearch: validateBoardSearch,
})

function WatchlistPage() {
  const { issue, notes, ai } = Route.useSearch()
  return <AppShell variant="watchlist" issue={issue} notes={notes} ai={ai} />
}
