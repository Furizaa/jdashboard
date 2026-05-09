import type { GetIssueResult, GetTransitionsResult, SearchIssuesResult } from '~/server/jira'
import type { GetMrStatusesResult, GetReviewCardsResult } from '~/server/gitlab'

export type Patch<T> = (prev: T | undefined) => T | undefined
export type Rollback = () => void

export type DashboardCache = {
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
