import { Context, Effect, Layer } from 'effect'
import { type ServerEnv as ServerEnvShape, getServerEnv } from '../env'

export type { ServerEnv as ServerEnvShape } from '../env'

export class ServerEnv extends Context.Tag('ServerEnv')<ServerEnv, ServerEnvShape>() {}

export const ServerEnvLive: Layer.Layer<ServerEnv> = Layer.effect(
  ServerEnv,
  Effect.sync(() => getServerEnv()),
)
