import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Board } from '~/contexts/board'
import { WatchlistBoard } from '~/contexts/watchlist'
import { IssueDetailPanel } from '~/contexts/detail'
import { AppChrome } from './-app-chrome'

/**
 * Which board the shell is showing. Keeps its one job: a board `AppShell`
 * renders. The chrome's own question — which *surface* has chrome — is
 * `ShellVariant`, and the two are deliberately distinct types (ADR-0009 §1).
 */
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

// The shell shared by both board routes: `AppChrome` (logo, header, nav rail,
// palette) composed with the board itself and the detail panel.
// `searchQuery` / `onlyWorkspace` are per-route local state — switching boards is
// switching routes, so each board keeps its own transient filter state. The
// filter text arrives from a palette command rather than a header input; the
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
    <AppChrome
      variant={variant}
      board={{
        filter: searchQuery,
        onFilterChange: setSearchQuery,
        onlyWorkspace,
        onToggleOnlyWorkspace: () => setOnlyWorkspace((v) => !v),
      }}
      overlay={
        <IssueDetailPanel
          issueKey={issue ?? null}
          notesOpen={notes ?? false}
          aiModal={ai ?? null}
          onAiModalConsumed={clearAi}
        />
      }
    >
      {variant === 'main' ? (
        <Board searchQuery={searchQuery} onlyWorkspace={onlyWorkspace} />
      ) : (
        <WatchlistBoard searchQuery={searchQuery} />
      )}
    </AppChrome>
  )
}
