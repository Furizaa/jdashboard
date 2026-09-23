import { useState } from 'react'
import { Board } from '~/contexts/board'
import { WatchlistBoard } from '~/contexts/watchlist'
import { IssueDetailPanel } from '~/contexts/detail'
import { AuthGate } from './-auth-gate'
import { CommandPaletteHost } from './-command-palette/CommandPaletteHost'
import { Header } from './-header'
import { Logo } from './-header/Logo'
import { NavRail } from './-nav/NavRail'

/** Which board the shell is showing. Also selects the header's tool set. */
export type BoardVariant = 'main' | 'watchlist'

export type BoardSearch = { issue?: string; notes?: boolean }

// Shared search schema for both board routes: the detail panel deep-link
// (`?issue=…&notes=…`) works identically on the main and watchlist boards.
export function validateBoardSearch(search: Record<string, unknown>): BoardSearch {
  const issue =
    typeof search.issue === 'string' && search.issue.trim() !== '' ? search.issue : undefined
  const notes =
    issue !== undefined && (search.notes === true || search.notes === 'true') ? true : undefined
  return { issue, notes }
}

// The app shell shared by both board routes: the left nav rail, a variant-aware
// header, the board itself, the detail panel, and the command palette.
// `searchQuery` / `onlyWorkspace` are per-route local state — switching boards is
// switching routes, so each board keeps its own transient filter state. The
// filter text now arrives from a palette command rather than a header input; the
// header shows it as a chip.
export function AppShell({
  variant,
  issue,
  notes,
}: {
  variant: BoardVariant
  issue: string | undefined
  notes: boolean | undefined
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyWorkspace, setOnlyWorkspace] = useState(false)
  return (
    <AuthGate>
      <div className="flex h-dvh flex-col">
        <div className="flex h-14 shrink-0">
          {/* The logo sits in the corner where the top bar and left rail meet;
              its right/bottom borders continue the rail and header lines. */}
          <div className="bg-background border-border flex w-14 shrink-0 items-center justify-center border-r border-b">
            <Logo />
          </div>
          <div className="min-w-0 flex-1">
            <Header
              variant={variant}
              filter={searchQuery}
              onClearFilter={() => setSearchQuery('')}
              onlyWorkspace={onlyWorkspace}
              onToggleOnlyWorkspace={() => setOnlyWorkspace((v) => !v)}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="min-h-0 min-w-0 flex-1">
            {variant === 'main' ? (
              <Board searchQuery={searchQuery} onlyWorkspace={onlyWorkspace} />
            ) : (
              <WatchlistBoard searchQuery={searchQuery} />
            )}
          </main>
        </div>
      </div>
      <IssueDetailPanel issueKey={issue ?? null} notesOpen={notes ?? false} />
      {/* Mounted once per board route, above the panel: ⌘K must work wherever
          you are, including with the detail panel open. */}
      <CommandPaletteHost filter={searchQuery} onFilterChange={setSearchQuery} />
    </AuthGate>
  )
}
