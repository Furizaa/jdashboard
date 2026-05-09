import { match } from 'ts-pattern'
import {
  isDeemphasized,
  type BoardIssue,
  type CiVisualState,
  type Column,
  type ReviewCard,
  type ReviewCardReal,
  type ReviewerVisualState,
} from '~/kernel'
import type { CardKind } from '~/lib/testids'
import { hasFixasapLabel } from '../domain/fixasap'

type ReviewerVisual = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

export type TicketCardViewModel = {
  cardKind: CardKind
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
  return match(input)
    .with({ kind: 'jira' }, ({ issue, column, baseUrl }) => {
      const jiraUrl = `${baseUrl}/browse/${issue.key}`
      return {
        cardKind: 'jira' as CardKind,
        keyDisplay: issue.key,
        keyClick: { kind: 'copy-jira' as const, url: jiraUrl },
        keyOpenInJira: jiraUrl,
        typeIcon: { kind: 'jira' as const, type: issue.typeName },
        summary: issue.summary,
        labels: issue.labels,
        epic: issue.epic,
        pill: { text: issue.statusName, clickable: true },
        bodyClick: { kind: 'open-panel' as const, issueKey: issue.key },
        mrSection: { mode: 'jira' as const, column, issueKey: issue.key },
        deemphasized: isDeemphasized(issue, column),
        fixasap: hasFixasapLabel(issue.labels),
      }
    })
    .with({ kind: 'review' }, ({ card, column, baseUrl }) => {
      const pill = { text: REVIEW_BUCKET_PILL[card.bucket], clickable: false }
      const mrSection = {
        mode: 'review' as const,
        reviewers: card.reviewers,
        ciState: card.ciState,
        unresolvedCount: card.unresolvedCount,
        mrState: card.mrState,
      }
      const deemphasized = isDeemphasized({ statusName: pill.text }, column)
      return match(card)
        .with({ kind: 'review-real' }, (real) => {
          const jiraUrl = `${baseUrl}/browse/${real.jira.key}`
          return {
            cardKind: 'review-real' as CardKind,
            keyDisplay: real.jira.key,
            keyClick: { kind: 'copy-jira' as const, url: jiraUrl },
            keyOpenInJira: jiraUrl,
            typeIcon: { kind: 'jira' as const, type: real.jira.typeName },
            summary: real.jira.summary,
            labels: real.jira.labels,
            epic: real.jira.epic,
            pill,
            bodyClick: { kind: 'open-panel' as const, issueKey: real.jira.key },
            mrSection,
            deemphasized,
            fixasap: hasFixasapLabel(real.jira.labels),
          }
        })
        .with({ kind: 'review-fake' }, (fake) => ({
          cardKind: 'review-fake' as CardKind,
          keyDisplay: `MR !${fake.iid}`,
          keyClick: { kind: 'open-mr' as const, url: fake.webUrl },
          keyOpenInJira: null,
          typeIcon: { kind: 'merge-request' as const },
          summary: fake.title,
          labels: [] as readonly string[],
          epic: null,
          pill,
          bodyClick: { kind: 'open-mr' as const, url: fake.webUrl },
          mrSection,
          deemphasized,
          fixasap: false,
        }))
        .exhaustive()
    })
    .exhaustive()
}
