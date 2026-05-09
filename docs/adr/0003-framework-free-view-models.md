# Framework-free view-models with thin React presenters

Every non-trivial screen in clashboard splits into two files:

- **`*-view-model.ts`** — pure TypeScript. A state machine `(state, event) → state` plus a derivation `(state, queryData, selection) → DisplayState`, both written with `ts-pattern` for exhaustive matching. **No React import. No TanStack Query import. No DOM.**
- **`use-*.ts`** — a thin React hook. Holds the view-model state via `useState`/`useReducer`, subscribes to TanStack Query / Router / DOM listeners, feeds query results into the view-model's derivation, returns the `DisplayState`.

Trivial hooks (one piece of state, no derivation) stay as plain hooks. The split applies when state shape is non-trivial — a discriminated phase machine, derivation across multiple inputs, or testable behaviour beyond "stores a value."

The success criterion: porting one screen to Svelte rewrites the presenter and view, reuses the view-model verbatim. This is what makes the React-decoupling claim verifiable rather than aspirational.

## Considered Options

- **Light decoupling (status quo).** `DashboardService` and per-context application services are React-free; hooks own the rest. *Rejected:* doesn't prove the decoupling claim. A reader can plausibly say "this codebase is a feature-folder React app with one extracted service object." The team-template angle requires the architecture be *demonstrable*, not just claimed.
- **Heavy decoupling — XState (or similar) machines.** View-models are XState machines; hooks are XState's `useMachine`. *Rejected:* clashboard's machines are too small to justify XState's runtime, learning curve, and devtool surface. `IssuePanelState` has four phases and no concurrent regions; `BoardViewState` has five and no cross-region orthogonality. XState is the right answer when machines have history states, parallel regions, or hierarchical transitions — clashboard does not. The risk of adopting XState here is teaching XState more than teaching clean architecture.
- **Medium decoupling — view-models as plain TS reducers (selected).** ts-pattern is the matching primitive; reducers are framework-agnostic; presenters are thin adapters. The pattern translates 1:1 to Svelte runes, Vue's `ref`/`computed`, Solid's signals — broadly portable.

## Consequences

- **Most `use-*WithDeps` hook flavors disappear.** The "hook with injected deps for testing" was a workaround for the fact that hooks owned logic. Logic now lives in view-models, which are unit-testable as plain functions.
- **Test pyramid shifts.** Each layer has its own test approach: domain → input/output; application service → fake gateway; view-model → table-driven over reducer + derivation; presenter → only when behaviour exceeds "feed view-model"; view → covered by e2e. View-model tests become the dominant unit-test category.
- **TanStack Query and TanStack Router are *adapters***, visible to presenters only. View-models receive `queryData` as a plain value and `navigate` as an injected function. They never call `useQuery` or `useNavigate`.
- **Sonner, `window`, `navigator.clipboard`, `document` are adapters too.** They live in the coordinator (the toast/navigate/browser-window adapters) or are passed into presenters/view-models as deps. View-models never import them directly.
- **The presenter file becomes the only place framework imports appear for a given screen.** A `grep` for `useQuery` outside `presenter/` files is a `dependency-cruiser` violation.
- **The Svelte port is real, not hypothetical.** A future demonstration — porting `Board` to Svelte alongside the React Board — would change one file (the presenter) and one file (the view), reusing `board-view-model.ts` byte-for-byte. The architecture earns its claim by passing this test.
