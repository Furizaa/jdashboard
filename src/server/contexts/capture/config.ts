import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type QuickCreateConfig = {
  readonly summaryPrefix: string
  readonly labels: readonly string[]
  readonly priority: string
}

export const defaultQuickCreateConfig: QuickCreateConfig = {
  summaryPrefix: '[FE]: ',
  labels: ['Frontend'],
  priority: 'Lowest',
}

export type CaptureConfigShape = {
  readonly projectKey: string
  readonly quickCreate: QuickCreateConfig
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
      baseUrl: env.JIRA_BASE_URL,
    }
  }),
)
