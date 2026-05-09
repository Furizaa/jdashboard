import { useMrFor, useReviewCards } from '~/coordinator'
import { ExternalLinkButton } from './ExternalLinkButton'

export function OpenMrLink({ issueKey }: { issueKey: string }) {
  const authorResult = useMrFor(issueKey)
  const reviewQuery = useReviewCards()
  const authorUrl =
    authorResult.state === 'ready' && authorResult.summary !== null
      ? authorResult.summary.webUrl
      : null
  const reviewUrl = (() => {
    if (authorUrl !== null) return null
    if (reviewQuery.data === undefined || reviewQuery.data.ok !== true) return null
    for (const card of reviewQuery.data.cards) {
      if (card.kind === 'review-real' && card.jira.key === issueKey) return card.webUrl
    }
    return null
  })()
  const href = authorUrl ?? reviewUrl
  if (href === null) return null
  return <ExternalLinkButton href={href}>Open MR</ExternalLinkButton>
}
