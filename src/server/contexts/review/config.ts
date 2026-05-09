import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type ReviewConfigShape = {
  readonly jiraProjectKey: string
  readonly lookbackDays: number
  readonly hideLabels: readonly string[]
  readonly baseUrl: string
}

export class ReviewConfig extends Context.Tag('ReviewConfig')<ReviewConfig, ReviewConfigShape>() {}

export const ReviewConfigLive: Layer.Layer<ReviewConfig, never, ServerEnv> = Layer.effect(
  ReviewConfig,
  Effect.gen(function* () {
    const env = yield* ServerEnv
    return {
      jiraProjectKey: env.JIRA_PROJECT_KEY,
      lookbackDays: env.JIRA_DONE_WINDOW_DAYS,
      hideLabels: env.JIRA_HIDE_LABELS,
      baseUrl: env.JIRA_BASE_URL,
    }
  }),
)
