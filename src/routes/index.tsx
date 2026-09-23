import { createFileRoute } from '@tanstack/react-router'
import { AppShell, validateBoardSearch } from './-app-shell'

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: validateBoardSearch,
})

function HomePage() {
  const { issue, notes, ai } = Route.useSearch()
  return <AppShell variant="main" issue={issue} notes={notes} ai={ai} />
}
