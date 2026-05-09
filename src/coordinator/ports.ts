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
