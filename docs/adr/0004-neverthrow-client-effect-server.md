# Different Result-type idioms on client and server (the JSON-boundary observation)

The client uses **`neverthrow`** for result types (`ResultAsync<T, E>` / `Result<T, E>`), with `E` always a hand-rolled tagged-error class (`class Unauthorized { readonly _tag = 'Unauthorized' }`). The server, when its own refactor pass starts, uses **`Effect`**. Both sides match results with **`ts-pattern`**, the canonical matching primitive. Tagged errors serialise as plain `{ _tag, ...payload }` objects on the wire.

The architectural claim is that the choice of Result library on the client is decoupled from the choice on the server because the JSON network boundary collapses both sides' values to plain objects regardless. Picking the same library on both sides is therefore a *style* decision, not a unification, and pays the cost of mixing Effect's idiom with React's render-flow without the corresponding benefit.

## Considered Options

- **Hand-rolled tagged discriminated unions on the client (status quo).** `type LoadIssueResult = { ok: true; ... } | { ok: false; reason: 'unauthorized' | 'not-found' }`. *Rejected:* the team-template angle wants a library convention so a reader from another project finds a familiar shape. The hand-rolled style is *correct* and currently works, but it doesn't translate as a convention to other projects in the team's portfolio.
- **Effect on both client and server.** Result types become `Effect.Effect<A, E, R>` or `Either.Either<L, R>` everywhere; matching via `Effect.match` / `Either.match` / `Effect.gen`. *Rejected:* the unification benefit doesn't survive the network boundary — `JSON.stringify` collapses `Either.left(new Unauthorized())` to `{ _tag: 'Left', left: { _tag: 'Unauthorized' } }`, which the client unwraps regardless. Running cost: ~5–15 KB gz of Effect runtime on the client, an idiom that fights React's render-flow (`Effect.gen` + pipe vs. `useState` + render), and a learning curve unrelated to the rest of the React stack. The migration churn is real (every result type rewritten, every match site rewritten) and earns nothing the JSON boundary doesn't already give us.
- **`neverthrow` on both sides.** *Rejected:* the server pass wants Effect for composable async, retries, fiber-style cancellation, and DI — the actual reasons to adopt Effect. neverthrow has no equivalent. Forcing the server to neverthrow would lose the case for going to Effect on the server in the first place.
- **`neverthrow` on client + Effect on server, ts-pattern as the bridge (selected).** The team-template angle gets a Result library on the client (neverthrow's `Result<T, E>` is recognisable from Rust/ML and lighter than Effect). The server gets Effect's algebra. The wire format remains tagged JSON; ts-pattern matches the underlying tagged unions on both sides.

## Tagged-error convention

Errors are tiny classes carrying a `_tag` literal:

```ts
class Unauthorized { readonly _tag = 'Unauthorized' as const }
class NotFound { readonly _tag = 'NotFound' as const }
class Rejected { readonly _tag = 'Rejected' as const; constructor(readonly message: string) {} }
```

Result types compose them:

```ts
type LoadIssueE = Unauthorized | NotFound
type LoadIssueResult = ResultAsync<{ baseUrl: string; issue: DetailIssue }, LoadIssueE>
```

Match sites use ts-pattern over the unwrapped tagged union or `result.match`:

```ts
return match(await result)
  .with({ ok: true }, ({ value }) => loaded(value))
  .with({ ok: false, error: { _tag: 'Unauthorized' } }, () => unauthorized())
  .with({ ok: false, error: { _tag: 'NotFound' } }, () => notFound())
  .exhaustive()
```

Adding a new error tag becomes a compile error in every match site — the exhaustiveness gate.

## Consequences

- **Existing `JiraResult<T>`, `GitlabResult<T>`, and downstream service result types are rewritten** as `ResultAsync<T, E>` over hand-rolled tagged-error classes. ~20 type definitions and ~50 match sites; mechanical migration done in one pass alongside the retroactive ts-pattern adoption.
- **`if`/`else if` ladders over `result.reason === '...'` are forbidden.** The retroactive ts-pattern pass replaces every existing one. New code uses ts-pattern from inception; oxlint's `pedantic` category warns on chained `===` comparisons over tagged fields.
- **The wire format is part of the contract.** Server functions return JSON-serialisable values: `{ ok: true, ... }` or `{ ok: false, error: { _tag: '...', ... } }`. The Effect server's tagged errors must serialise to this exact shape; a thin "to-wire" mapper at the network boundary on the server side handles the conversion.
- **The client never imports `effect`.** The `effect` package is reserved for the server pass. Bundle weight, tree-shaking surprises, and idiom drag are avoided.
- **The server never imports `neverthrow`.** `neverthrow` is reserved for the client. The two libraries do not meet in the codebase; ts-pattern is the only shared idiom.
- **The decision survives the server's eventual refactor.** When Effect lands on the server, the wire shape doesn't change; the client requires no follow-up. The server pass is genuinely independent of this ADR.
