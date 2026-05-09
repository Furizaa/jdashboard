export const testIds = Object.freeze({
  ticketCard: 'ticket-card',
  labelDot: 'label-dot',
  labelOverflowChip: 'label-overflow-chip',
  syncIndicator: 'sync-indicator',
  refreshButton: 'refresh-button',
  subIssueRow: 'sub-issue-row',
  linkedIssueRow: 'linked-issue-row',
  mrSection: 'mr-section',
  reviewerAvatar: 'reviewer-avatar',
  ciIndicator: 'ci-indicator',
  unresolvedThreadChip: 'unresolved-thread-chip',
  mrWarningRow: 'mr-warning-row',
} as const)

/** `data-kind` discriminator on `mrWarningRow`. */
export const mrWarningKind = Object.freeze({
  noMr: 'no-mr',
  draft: 'draft',
  noReviewers: 'no-reviewers',
  mergedDesync: 'merged-desync',
  doneStillOpen: 'done-still-open',
} as const)
export type MrWarningKind = (typeof mrWarningKind)[keyof typeof mrWarningKind]

/**
 * Values of the `data-animation` attribute on `ticket-card`. State markers
 * (not interaction targets); tests select via `[data-animation="..."]`.
 */
export const cardAnimationState = Object.freeze({
  changePulse: 'changed',
  entering: 'entering',
  leaving: 'leaving',
} as const)
