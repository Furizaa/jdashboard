import { Effect, Schema } from 'effect'

export type TaggedErrorPayload = { readonly _tag: string }

export type WireSuccess<A extends object> = { readonly ok: true } & A

export type WireFailure = {
  readonly ok: false
  readonly error: TaggedErrorPayload
}

export type WireResult<A extends object> = WireSuccess<A> | WireFailure

const INTERNAL_ERROR_TAG = 'InternalError'

export const toWire = <A extends object, E, IE extends TaggedErrorPayload>(
  program: Effect.Effect<A, E, never>,
  errorSchema: Schema.Schema<E, IE, never>,
): Effect.Effect<WireResult<A>, never, never> => {
  const encodeError = Schema.encodeUnknownSync(errorSchema)
  return program.pipe(
    Effect.match({
      onSuccess: (value): WireResult<A> => ({ ok: true, ...value }),
      onFailure: (error): WireResult<A> => ({
        ok: false,
        error: encodeError(error),
      }),
    }),
    Effect.catchAllDefect((defect) =>
      Effect.sync((): WireResult<A> => {
        console.error('[toWire] Unhandled defect:', defect)
        return { ok: false, error: { _tag: INTERNAL_ERROR_TAG } }
      }),
    ),
  )
}
