export type GitlabResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'rejected'; message: string }

export type GatewayUser = {
  username: string
  displayName: string
}

export type RawMrSummary = {
  iid: number
  title: string
  webUrl: string
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft: boolean
  updatedAt: string
}

export type RawReviewer = {
  username: string
  displayName: string
  avatarUrl: string | null
}

export type RawMrDetail = RawMrSummary & {
  reviewers: RawReviewer[]
  headPipelineStatus: string | null
  hasConflicts: boolean
}

export type RawNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
}

export type RawDiscussion = {
  id: string
  notes: RawNote[]
}

export type RawApprovals = {
  approvedUsernames: readonly string[]
}

export type ListMrsQuery = {
  states: ReadonlyArray<'opened' | 'merged'>
  authorUsername: string
  updatedAfter: Date
}

export interface GitlabGateway {
  getCurrentUser(): Promise<GitlabResult<GatewayUser>>
  listMrs(query: ListMrsQuery): Promise<GitlabResult<RawMrSummary[]>>
  getMr(iid: number): Promise<GitlabResult<RawMrDetail>>
  getMrDiscussions(iid: number): Promise<GitlabResult<RawDiscussion[]>>
  getMrApprovals(iid: number): Promise<GitlabResult<RawApprovals>>
}
