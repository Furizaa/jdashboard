import type { GetIssueResult } from '~/kernel'

export interface DetailGateway {
  loadIssue(key: string): Promise<GetIssueResult>
}

export interface DetailCachePort {
  invalidateIssue(key: string): void
}
