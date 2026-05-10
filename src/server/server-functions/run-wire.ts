import type { Effect, ManagedRuntime, Schema } from 'effect'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

type AppContext = ManagedRuntime.ManagedRuntime.Context<typeof appRuntime>

/**
 * Run an Effect program through `toWire` and the application runtime, demoting
 * the InternalError envelope branch to a thrown `Error` so react-query's
 * `isError` flag flips at the call site. Tagged failures stay in the wire shape.
 */
export const runWire = async <
  A extends object,
  E,
  IE extends { readonly _tag: string },
  R extends AppContext,
>(
  program: Effect.Effect<A, E, R>,
  errorSchema: Schema.Schema<E, IE, never>,
  label: string,
): Promise<WireResult<A, IE>> => {
  const wire = await appRuntime.runPromise(toWire(program, errorSchema))
  if (!wire.ok && wire.error._tag === 'InternalError') {
    throw new Error(`${label}: internal error`)
  }
  return wire as WireResult<A, IE>
}
