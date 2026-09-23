import type {
  GetIssueResult,
  GetMrStatusesResult,
  GetReviewCardsResult,
  GetTransitionsResult,
  SearchIssuesResult,
} from '~/kernel'

export type Patch<T> = (prev: T | undefined) => T | undefined
export type Rollback = () => void

export interface Cache {
  readBoard(): SearchIssuesResult | undefined
  readIssue(key: string): GetIssueResult | undefined
  readTransitions(key: string): GetTransitionsResult | undefined
  readMrStatuses(): GetMrStatusesResult | undefined
  readReviewCards(): GetReviewCardsResult | undefined

  fetchTransitions(key: string): Promise<GetTransitionsResult>

  patchBoard(patch: Patch<SearchIssuesResult>): Rollback
  patchIssue(key: string, patch: Patch<GetIssueResult>): Rollback

  cancelBoard(): Promise<void>
  cancelIssue(key: string): Promise<void>

  invalidateBoard(): void
  invalidateIssue(key: string): void
  invalidateAllIssues(): void
  invalidateTransitions(key: string): void
  invalidateMrStatuses(): void
  invalidateReviewCards(): void
}

export type ToastOptions = {
  description?: string
  action?: { label: string; onClick: () => void }
  cancel?: { label: string; onClick: () => void }
}

export type ToastFn = (message: string, opts?: ToastOptions) => void

export interface Toast {
  success: ToastFn
  error: ToastFn
}

export interface Navigate {
  toIssue(key: string): void
  clearIssue(): void
}

export interface Browser {
  openInNewTab(url: string): void
  copyToClipboard(text: string): Promise<void>
}

/**
 * The header modals the command palette can open without owning their state.
 *
 * Each of these lives in a header button that holds its own open state
 * internally. Registering an opener upward is one line per button, where lifting
 * five modals into the shell would change five contexts' public surfaces and
 * split each button from its modal — see ADR-0008.
 */
export type CommandTarget =
  | 'new-ticket'
  | 'add-to-watchlist'
  | 'manage-tags'
  | 'bulk-refine'
  | 'configure-lanes'

export interface Commands {
  /**
   * Register an opener for a target. Returns the unregister, which the caller
   * must run on unmount — otherwise the bus holds a stale opener after a route
   * change, and `Configure lanes` would appear to work from the main board.
   */
  register(target: CommandTarget, open: () => void): () => void
  /**
   * The targets that currently have an opener. A target without one is not
   * offered at all: `Configure lanes` only exists on `/watchlist`, and the
   * honest answer on `/` is that the command is not available, not that it
   * silently does nothing.
   */
  readonly registered: readonly CommandTarget[]
  /** Open a target. A no-op — never a throw — when nothing is registered. */
  open(target: CommandTarget): void
}
