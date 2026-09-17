import { Context, Effect, Layer } from 'effect'
import { ServerEnv } from '../../runtime/server-env'

export type WatchlistConfigShape = {
  readonly baseUrl: string
  readonly hideLabels: readonly string[]
}

export class WatchlistConfig extends Context.Tag('WatchlistConfig')<
  WatchlistConfig,
  WatchlistConfigShape
>() {}

export const WatchlistConfigLive: Layer.Layer<WatchlistConfig, never, ServerEnv> = Layer.effect(
  WatchlistConfig,
  Effect.gen(function* () {
    const env = yield* ServerEnv
    return {
      baseUrl: env.JIRA_BASE_URL,
      hideLabels: env.JIRA_HIDE_LABELS,
    }
  }),
)
