import { Effect } from 'effect'
import { JiraRejected } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { PerformTransitionError } from '../errors'

// success has no payload; the wire shape is just { ok: true }. `Record<never, never>` is
// the canonical way to spell "an empty object" without colliding with `{}` (any non-null).
// oxlint-disable-next-line typescript/no-empty-object-type, ban-types
export type PerformTransitionOk = Record<never, never>

export const performTransition = (
  key: string,
  transitionId: string,
): Effect.Effect<PerformTransitionOk, PerformTransitionError, JiraGateway> =>
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    yield* jira.transitionIssue(key, transitionId).pipe(
      // Preserved from the legacy issue-service: a 404 from Jira's transition
      // endpoint surfaces to the user as "Issue not found", reusing the
      // Rejected error shape so the wire union stays { Unauthorized | Rejected }.
      Effect.catchTag('NotFound', () =>
        Effect.fail(new JiraRejected({ message: 'Issue not found' })),
      ),
    )
    return {}
  })
