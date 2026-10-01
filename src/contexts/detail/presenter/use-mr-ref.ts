import { useMrStatuses, useReviewCards } from '~/coordinator'
import { resolveMrForKey, type MrRef } from '~/kernel'

/**
 * The MR for a ticket — one we authored, or one we are a reviewer on.
 *
 * Three views in this context needed it (`OpenMrLink`, `ExplainMrButton`,
 * `OpenInWorkspaceButton`) and each had grown its own `findReviewMrIid` /
 * `findReviewMrUrl`. The *rule* now lives in `kernel/mr-for-key.ts`; this hook is
 * detail's binding of it to the two queries. The command palette binds the same
 * pure function to the same queries in `routes/-command-palette/`, because it
 * resolves keys it was handed rather than one it renders — and because a context
 * cannot hand a hook to another context.
 */
export function useMrRef(issueKey: string): MrRef | null {
  const mrStatuses = useMrStatuses()
  const reviewQuery = useReviewCards()
  const authoredByKey = mrStatuses.data?.ok === true ? mrStatuses.data.byKey : undefined
  const reviewCards = reviewQuery.data?.ok === true ? reviewQuery.data.cards : undefined
  return resolveMrForKey({ issueKey, authoredByKey, reviewCards })
}
