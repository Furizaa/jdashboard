import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type BoardConfigShape = {
  readonly projectKey: string
  readonly labelFilter: string
  readonly hideLabels: readonly string[]
  readonly doneWindowDays: number
  readonly baseUrl: string
}

export class BoardConfig extends Context.Tag('BoardConfig')<BoardConfig, BoardConfigShape>() {}

export const BoardConfigLive: Layer.Layer<BoardConfig, never, ServerEnv> = Layer.effect(
  BoardConfig,
  Effect.gen(function* () {
    const env = yield* ServerEnv
    return {
      projectKey: env.JIRA_PROJECT_KEY,
      labelFilter: env.JIRA_LABEL_FILTER,
      hideLabels: env.JIRA_HIDE_LABELS,
      doneWindowDays: env.JIRA_DONE_WINDOW_DAYS,
      baseUrl: env.JIRA_BASE_URL,
    }
  }),
)
