import { describe, expect, it } from '@effect/vitest'
import { Cause, Effect, Exit, Schema } from 'effect'
import { dieOn } from './die-on'

class TagA extends Schema.TaggedError<TagA>()('TagA', { message: Schema.String }) {}
class TagB extends Schema.TaggedError<TagB>()('TagB', { message: Schema.String }) {}

describe('dieOn', () => {
  it.effect('demotes a tag in the list to a defect', () =>
    Effect.gen(function* () {
      const program: Effect.Effect<never, TagA | TagB> = Effect.fail(new TagA({ message: 'x' }))
      const exit = yield* Effect.exit(program.pipe(dieOn('TagA', 'TagB')))
      expect(Exit.isFailure(exit) && Cause.isDieType(exit.cause)).toBe(true)
    }),
  )

  it.effect('propagates a tag NOT in the list as a tagged failure', () =>
    Effect.gen(function* () {
      const program: Effect.Effect<never, TagA | TagB> = Effect.fail(new TagB({ message: 'y' }))
      const failure = yield* Effect.flip(program.pipe(dieOn('TagA')))
      expect(failure._tag).toBe('TagB')
    }),
  )

  it.effect('passes a successful effect through unchanged', () =>
    Effect.gen(function* () {
      const program: Effect.Effect<number, TagA> = Effect.succeed(42)
      const result = yield* program.pipe(dieOn('TagA'))
      expect(result).toBe(42)
    }),
  )
})
