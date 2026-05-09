import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type DetailConfigShape = {
  readonly baseUrl: string
}

export class DetailConfig extends Context.Tag('DetailConfig')<DetailConfig, DetailConfigShape>() {}

export const DetailConfigLive: Layer.Layer<DetailConfig, never, ServerEnv> = Layer.effect(
  DetailConfig,
  Effect.gen(function* () {
    const env = yield* ServerEnv
    return {
      baseUrl: env.JIRA_BASE_URL,
    }
  }),
)
