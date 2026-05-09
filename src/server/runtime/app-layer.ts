import { FetchHttpClient, HttpClient, HttpClientError } from '@effect/platform'
import { Effect, Layer, Schedule } from 'effect'
import { ServerEnv, ServerEnvLive } from './server-env'

const RETRY_ATTEMPTS = 2
const TIMEOUT_DURATION = '10 seconds'

const retrySchedule = Schedule.exponential('100 millis').pipe(
  Schedule.compose(Schedule.recurs(RETRY_ATTEMPTS)),
)

const HttpClientLive: Layer.Layer<HttpClient.HttpClient> = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(HttpClient.HttpClient, (base) =>
    base.pipe(
      HttpClient.transform((eff, request) =>
        eff.pipe(
          Effect.timeoutFail({
            duration: TIMEOUT_DURATION,
            onTimeout: () =>
              new HttpClientError.RequestError({
                request,
                reason: 'Transport',
                description: `Request timed out after ${TIMEOUT_DURATION}`,
              }),
          }),
        ),
      ),
      HttpClient.retryTransient({ schedule: retrySchedule }),
    ),
  ),
).pipe(Layer.provide(FetchHttpClient.layer))

export const appLayer: Layer.Layer<ServerEnv | HttpClient.HttpClient> = Layer.mergeAll(
  ServerEnvLive,
  HttpClientLive,
)
