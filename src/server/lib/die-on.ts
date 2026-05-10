import { Effect } from 'effect'

// Reduces to `unknown` when every tag literal is a member of the input
// effect's error union, otherwise to a phantom-typed object that an Effect
// cannot satisfy. Surfaces typo'd tags as a compile error at the call site
// rather than as a silent no-op at runtime.
type ConstrainTags<Tags extends string, AllTags extends string> = [Tags] extends [AllTags]
  ? unknown
  : { readonly __dieOnUnknownTags: Exclude<Tags, AllTags> }

/**
 * Demote the listed tagged errors to defects.
 *
 * `dieOn('NotFound', 'Rejected')` is equivalent to
 * `Effect.catchTags({ NotFound: Effect.die, Rejected: Effect.die })`.
 *
 * Tag literals are constrained against the input effect's error union; a
 * typo (e.g. `dieOn('NotFOund')` against `Unauthorized | NotFound | Rejected`)
 * is a compile error.
 */
export const dieOn =
  <const Tags extends ReadonlyArray<string>>(...tags: Tags) =>
  <A, E extends { readonly _tag: string }, R>(
    effect: Effect.Effect<A, E, R> & ConstrainTags<Tags[number], E['_tag']>,
  ): Effect.Effect<A, Exclude<E, { readonly _tag: Tags[number] }>, R> => {
    type Handlers = { readonly [K in Tags[number]]: typeof Effect.die }
    const handlers = Object.fromEntries(tags.map((tag) => [tag, Effect.die])) as Handlers
    return (effect as Effect.Effect<A, E, R>).pipe(
      Effect.catchTags(handlers as never),
    ) as Effect.Effect<A, Exclude<E, { readonly _tag: Tags[number] }>, R>
  }
