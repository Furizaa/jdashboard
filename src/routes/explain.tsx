import { createFileRoute } from '@tanstack/react-router'
import { ExplainShell } from './-explain/ExplainShell'
import { validateExplainSearch } from './-explain/explain-search'

export const Route = createFileRoute('/explain')({
  component: ExplainPage,
  validateSearch: validateExplainSearch,
})

function ExplainPage() {
  const { mr, move } = Route.useSearch()
  return <ExplainShell mr={mr} move={move} />
}
