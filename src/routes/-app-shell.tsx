import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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

/** Which AI modal to open on arrival — the palette's `r` / `a` hand-off. */
export type AiModal = 'refine' | 'ask'

export type BoardSearch = { issue?: string; notes?: boolean; ai?: AiModal }

// Shared search schema for both board routes: the detail panel deep-link
// (`?issue=…&notes=…&ai=…`) works identically on the main and watchlist boards.
//
// `ai` exists because Refine and Ask cannot be hoisted out of the note editor —
// `useRefineModal` adopts refined content straight into it — so the palette
// hands off through the URL, extending the mechanism `notes` already uses.
export function validateBoardSearch(search: Record<string, unknown>): BoardSearch {
  const issue =
    typeof search.issue === 'string' && search.issue.trim() !== '' ? search.issue : undefined
  // Meaningless without a ticket, and meaningless without the notes pane, whose
  // NotesPanel is where the two modals are mounted — so a hand-typed
  // `?issue=X&ai=refine` implies the pane rather than pointing at nothing.
  const ai =
    issue !== undefined && (search.ai === 'refine' || search.ai === 'ask')
      ? (search.ai as AiModal)
      : undefined
  const notes =
    issue !== undefined && (search.notes === true || search.notes === 'true' || ai !== undefined)
      ? true
      : undefined
  return { issue, notes, ai }
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
  ai,
}: {
  variant: BoardVariant
  issue: string | undefined
  notes: boolean | undefined
  ai: AiModal | undefined
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyWorkspace, setOnlyWorkspace] = useState(false)
  const navigate = useNavigate()
  // The `ai` param is consumed the moment the panel acts on it, so a refresh
  // cannot silently reopen a modal the user already saw. `replace` is what
  // covers the back-button: pushing would leave `?ai=` one step back in history,
  // and going back to it would reopen the modal all over again.
  const clearAi = useCallback(() => {
    if (issue === undefined) return
    navigate({
      to: '.',
      replace: true,
      search: { issue, ...(notes === true ? { notes: true } : {}) },
    })
  }, [navigate, issue, notes])
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
      <IssueDetailPanel
        issueKey={issue ?? null}
        notesOpen={notes ?? false}
        aiModal={ai ?? null}
        onAiModalConsumed={clearAi}
      />
      {/* Mounted once per board route, above the panel: ⌘K must work wherever
          you are, including with the detail panel open. */}
      <CommandPaletteHost
        variant={variant}
        filter={searchQuery}
        onFilterChange={setSearchQuery}
        onlyWorkspace={onlyWorkspace}
        onToggleOnlyWorkspace={() => setOnlyWorkspace((v) => !v)}
      />
    </AuthGate>
  )
}
