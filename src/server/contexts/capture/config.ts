import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type QuickCreateConfig = {
  readonly summaryPrefix: string
  readonly labels: readonly string[]
  readonly priority: string
}

export type EpicConfig = {
  readonly statuses: readonly string[]
}

export const defaultQuickCreateConfig: QuickCreateConfig = {
  summaryPrefix: '[FE]: ',
  labels: ['Frontend'],
  priority: 'Lowest',
}

export const defaultEpicConfig: EpicConfig = {
  statuses: ['In Progress'],
}

export type CaptureConfigShape = {
  readonly projectKey: string
  readonly quickCreate: QuickCreateConfig
  readonly epic: EpicConfig
  readonly baseUrl: string
}

export class CaptureConfig extends Context.Tag('CaptureConfig')<
  CaptureConfig,
  CaptureConfigShape
>() {}

export const CaptureConfigLive: Layer.Layer<CaptureConfig, never, ServerEnv> = Layer.effect(
  CaptureConfig,
  Effect.gen(function* () {
    const env = yield* ServerEnv
    return {
      projectKey: env.JIRA_PROJECT_KEY,
      quickCreate: defaultQuickCreateConfig,
      epic: defaultEpicConfig,
      baseUrl: env.JIRA_BASE_URL,
    }
  }),
)
