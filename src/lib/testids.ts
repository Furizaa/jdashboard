export const testIds = Object.freeze({
  ticketCard: 'ticket-card',
  labelDot: 'label-dot',
  labelOverflowChip: 'label-overflow-chip',
  syncIndicator: 'sync-indicator',
  refreshButton: 'refresh-button',
  subIssueRow: 'sub-issue-row',
  linkedIssueRow: 'linked-issue-row',
} as const)

/**
 * Values of the `data-animation` attribute on `ticket-card`. State markers
 * (not interaction targets); tests select via `[data-animation="..."]`.
 */
export const cardAnimationState = Object.freeze({
  changePulse: 'changed',
  entering: 'entering',
  leaving: 'leaving',
} as const)
