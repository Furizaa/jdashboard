import type { BoardIssue } from '~/server/jira'
import type { ReviewCard, ReviewCardReal } from '~/server/gitlab'
import type { Column } from '~/features/board/status-mapping'
import { isDeemphasized } from '~/features/board/deemphasize'
import type { CiVisualState, ReviewerVisualState } from '~/features/mr-status'
import { hasFixasapLabel } from './fixasap'

type ReviewerVisual = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

export type TicketCardViewModel = {
  keyDisplay: string
  keyClick: { kind: 'copy-jira'; url: string } | { kind: 'open-mr'; url: string }
  keyOpenInJira: string | null
  typeIcon: { kind: 'jira'; type: string } | { kind: 'merge-request' }
  summary: string
  labels: readonly string[]
  epic: { key: string; summary: string } | null
  pill: { text: string; clickable: boolean }
  bodyClick: { kind: 'open-panel'; issueKey: string } | { kind: 'open-mr'; url: string }
  mrSection:
    | { mode: 'jira'; column: Column; issueKey: string }
    | {
        mode: 'review'
        reviewers: readonly ReviewerVisual[]
        ciState: CiVisualState
        unresolvedCount: number
        mrState: 'opened' | 'merged'
      }
    | null
  deemphasized: boolean
  fixasap: boolean
}

export type BuildCardViewInput =
  | { kind: 'jira'; issue: BoardIssue; column: Column; baseUrl: string }
  | { kind: 'review'; card: ReviewCard; column: Column; baseUrl: string }

const REVIEW_BUCKET_PILL: Record<ReviewCardReal['bucket'], string> = {
  'needs-review': 'Needs Review',
  rejected: 'Review Rejected',
  accepted: 'Review Accepted',
}

export function buildCardView(input: BuildCardViewInput): TicketCardViewModel {
  if (input.kind === 'jira') {
    const { issue, column, baseUrl } = input
    const jiraUrl = `${baseUrl}/browse/${issue.key}`
    return {
      keyDisplay: issue.key,
      keyClick: { kind: 'copy-jira', url: jiraUrl },
      keyOpenInJira: jiraUrl,
      typeIcon: { kind: 'jira', type: issue.typeName },
      summary: issue.summary,
      labels: issue.labels,
      epic: issue.epic,
      pill: { text: issue.statusName, clickable: true },
      bodyClick: { kind: 'open-panel', issueKey: issue.key },
      mrSection: { mode: 'jira', column, issueKey: issue.key },
      deemphasized: isDeemphasized(issue, column),
      fixasap: hasFixasapLabel(issue.labels),
    }
  }

  const { card, column, baseUrl } = input
  const pill = { text: REVIEW_BUCKET_PILL[card.bucket], clickable: false }
  const mrSection = {
    mode: 'review' as const,
    reviewers: card.reviewers,
    ciState: card.ciState,
    unresolvedCount: card.unresolvedCount,
    mrState: card.mrState,
  }
  const deemphasized = isDeemphasized({ statusName: pill.text }, column)

  if (card.kind === 'review-real') {
    const jiraUrl = `${baseUrl}/browse/${card.jira.key}`
    return {
      keyDisplay: card.jira.key,
      keyClick: { kind: 'copy-jira', url: jiraUrl },
      keyOpenInJira: jiraUrl,
      typeIcon: { kind: 'jira', type: card.jira.typeName },
      summary: card.jira.summary,
      labels: card.jira.labels,
      epic: card.jira.epic,
      pill,
      bodyClick: { kind: 'open-panel', issueKey: card.jira.key },
      mrSection,
      deemphasized,
      fixasap: hasFixasapLabel(card.jira.labels),
    }
  }

  return {
    keyDisplay: `MR !${card.iid}`,
    keyClick: { kind: 'open-mr', url: card.webUrl },
    keyOpenInJira: null,
    typeIcon: { kind: 'merge-request' },
    summary: card.title,
    labels: [],
    epic: null,
    pill,
    bodyClick: { kind: 'open-mr', url: card.webUrl },
    mrSection,
    deemphasized,
    fixasap: false,
  }
}
