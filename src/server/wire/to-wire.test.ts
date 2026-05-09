import { describe, expect, it, vi } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { toWire } from './to-wire'

class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}

class Rejected extends Schema.TaggedError<Rejected>()('Rejected', {
  message: Schema.String,
}) {}

const ErrorUnion = Schema.Union(Unauthorized, Rejected)

describe('toWire', () => {
  it.effect('wraps a success Effect into { ok: true, ...A }', () =>
    Effect.gen(function* () {
      const program = Effect.succeed({ items: [1, 2], total: 2 })
      const result = yield* toWire(program, ErrorUnion)
      expect(result).toEqual({ ok: true, items: [1, 2], total: 2 })
    }),
  )

  it.effect('encodes a tagged failure into { ok: false, error: { _tag, ...payload } }', () =>
    Effect.gen(function* () {
      const program = Effect.fail(new Rejected({ message: 'nope' }))
      const result = yield* toWire(program, ErrorUnion)
      expect(result).toEqual({
        ok: false,
        error: { _tag: 'Rejected', message: 'nope' },
      })
    }),
  )

  it.effect('demotes an unhandled defect to { ok: false, error: { _tag: "InternalError" } }', () =>
    Effect.gen(function* () {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program: Effect.Effect<
        { items: ReadonlyArray<number> },
        Unauthorized | Rejected,
        never
      > = Effect.die(new Error('unexpected'))
      const result = yield* toWire(program, ErrorUnion)
      expect(result).toEqual({
        ok: false,
        error: { _tag: 'InternalError' },
      })
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    }),
  )
})
