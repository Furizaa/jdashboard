import { Effect, Schema } from 'effect'

export type TaggedErrorPayload = { readonly _tag: string }

export type WireSuccess<A extends object> = { readonly ok: true } & A

export type WireFailure<E extends TaggedErrorPayload = TaggedErrorPayload> = {
  readonly ok: false
  readonly error: E
}

export type WireResult<A extends object, E extends TaggedErrorPayload = TaggedErrorPayload> =
  | WireSuccess<A>
  | WireFailure<E>

const INTERNAL_ERROR_TAG = 'InternalError'

export type InternalErrorPayload = { readonly _tag: typeof INTERNAL_ERROR_TAG }

export const toWire = <A extends object, E, IE extends TaggedErrorPayload, R>(
  program: Effect.Effect<A, E, R>,
  errorSchema: Schema.Schema<E, IE, never>,
): Effect.Effect<WireResult<A, IE | InternalErrorPayload>, never, R> => {
  const encodeError = Schema.encodeUnknownSync(errorSchema)
  return program.pipe(
    Effect.match({
      onSuccess: (value): WireResult<A, IE | InternalErrorPayload> => ({ ok: true, ...value }),
      onFailure: (error): WireResult<A, IE | InternalErrorPayload> => ({
        ok: false,
        error: encodeError(error),
      }),
    }),
    Effect.catchAllDefect((defect) =>
      Effect.sync((): WireResult<A, IE | InternalErrorPayload> => {
        console.error('[toWire] Unhandled defect:', defect)
        return { ok: false, error: { _tag: INTERNAL_ERROR_TAG } }
      }),
    ),
  )
}
