import { useMrFor, useReviewCards } from '~/coordinator'
import type { GetReviewCardsResult } from '~/kernel'
import { ExternalLinkButton } from './ExternalLinkButton'

function findReviewMrUrl(data: GetReviewCardsResult | undefined, issueKey: string): string | null {
  if (data === undefined || data.ok !== true) return null
  for (const card of data.cards) {
    if (card.kind === 'review-real' && card.jira.key === issueKey) return card.webUrl
  }
  return null
}

export function OpenMrLink({ issueKey }: { issueKey: string }) {
  const authorResult = useMrFor(issueKey)
  const reviewQuery = useReviewCards()
  const authorUrl =
    authorResult.state === 'ready' && authorResult.summary !== null
      ? authorResult.summary.webUrl
      : null
  const href = authorUrl ?? findReviewMrUrl(reviewQuery.data, issueKey)
  if (href === null) return null
  return <ExternalLinkButton href={href}>Open MR</ExternalLinkButton>
}
