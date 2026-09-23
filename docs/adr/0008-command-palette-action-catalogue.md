# The command palette owns the flow; `routes/` assembles its actions

The command palette (⌘K) searches every work item on the board — assigned Jira tickets, watchlist cards, and GitLab review cards — and runs any action legal for the one you pick. That makes it inherently cross-context: it reads Board + Watchlist + Review, and executes actions owned by Detail, Tags, Watchlist, Capture, and Bulk Refine. `.dependency-cruiser.cjs`'s `no-cross-context` rule forbids `contexts/A → contexts/B`, so the naive shape would need six new forbidden edges — one per context the palette touches.

We decided that **`contexts/command-palette/` owns the flow and knows nothing about any other context.** Actions arrive as plain descriptors:

```ts
type PaletteAction = {
  kind: ActionKind // discriminated union in kernel/, matched exhaustively
  label: string
  enabled: boolean
  perform: { effect: 'run'; run: () => void } | { effect: 'sub-list'; subList: SubListKind }
}
```

The cross-context **assembly** of those descriptors lives in `src/routes/-command-palette/`, because `routes/` is already the only place multiple contexts compose (ADR-0007). Zero new dependency edges. This is the same idiom the codebase already uses for `navigate`, which view-models receive as an injected plain function rather than importing the router.

We also decided to **promote `WorkItem` to a kernel type** (`src/kernel/work-item.ts`). CONTEXT-MAP's glossary listed it as a _candidate term, not yet adopted_ — "a thing on the board, regardless of source … modelled as a discriminated union at the assembly layer; not a first-class type." A palette searching all three sources at once is the use-case that earns it, and it gives one place to dedupe: an assigned ticket may also be on the watchlist, and a real review card carries a Jira key.

Alongside it, `src/kernel/commands.ts` declares `ActionKind`, the curated `ACTION_SHORTCUTS` map, and `ActionGroup`.

## Considered options

- **(a) The palette imports the six contexts it needs directly.** _Rejected:_ it breaks `no-cross-context`, the rule CONTEXT-MAP names as "the rule that defines the architecture". Relaxing it for one consumer would make every subsequent context-to-context shortcut arguable.

- **(b) A coordinator-hosted action registry.** There is precedent: `coordinator/index.ts` already barrel-re-exports hooks from `~/contexts/{review,watchlist,tags}`, so contexts reach each other's capabilities through it today. _Rejected:_ those re-exports are already barrel-laundering past `coordinator-cant-see-context-views` — a presenter hook is not an application service. Three narrow hooks is a pragmatic seam; ~25 actions wired through the same hole would make the coordinator the de facto home of every context's presentation layer, and the rule would stop meaning anything.

- **(c) All of it in `routes/`.** _Rejected:_ `routes/` has no layer structure, so the ranking function, the key→intent mapping, and the legality rules would all become untestable React internals. The palette's whole value is a state machine that can be exercised as plain functions (ADR-0003).

- **(d) Positional digit shortcuts (`1`–`9`) for the action list.** _Rejected:_ the key for an action would shift as legality changed, so no muscle memory could form — the opposite of the feature's goal. Digits _are_ used inside the status sub-list, where the list is short, dynamic, and homogeneous, and where there is nothing stable to memorise anyway.

- **(e) ⌘-modified shortcuts, as Raycast uses.** _Rejected:_ ⌘T, ⌘N, and ⌘W are owned by the browser and cannot be reliably intercepted in a web app.

## Consequences

- **The palette has no `application/` layer.** It owns no gateway; its data and its actions arrive injected. This is precedented by `contexts/tags/`, whose CONTEXT.md table also lists only view-model / presenter / view. A reader looking for `application/` should stop looking — its absence is the design.

- **`cmdk` is not adopted.** It would own the query, selection, and navigation state that ADR-0003 assigns to the view-model, and CONTEXT-MAP already skips libraries on exactly that reasoning. Radix Dialog is already in via `design-system/dialog.tsx`, which is the only primitive the palette actually needs.

- **Board filtering became a palette command.** The header search box is deleted; whatever is typed in the palette _is_ the filter text, applied by a root-level command. One search surface in the app, at the cost of live board narrowing as you type.

- **Global commands are `Enter`-only, not keyed.** The palette's root level owns a text query, so a bare letter there types rather than runs. Per-item actions get letters because the action list has no text filter — that asymmetry is the price of having one input.

- **Adding an action is a compile error until it is handled everywhere.** `ActionKind` is matched exhaustively via `ts-pattern`, and a duplicate letter in `ACTION_SHORTCUTS` throws at module load.

- **`PaletteAction` carries a `perform`, not a bare `run`.** The PRD sketched `run: () => void`; two actions open a nested list instead of acting, and a callback that secretly navigates would be a callback that lies. `perform` is a two-case union the palette matches exhaustively, so the assembly declares which actions are sub-lists and the palette stays ignorant of which `ActionKind`s happen to be.

- **A `Commands` port opens the five header modals.** Each lives in a header button that owns its own open state; `coordinator/adapters/command-bus.tsx` lets the button register an opener upward in one line (`useRegisterCommand`), where lifting five modals into the shell would change five contexts' public surfaces and split each button from its modal. React in `coordinator/adapters/` is what `coordinator-effects-only-in-adapters` permits, with `provider.tsx` as precedent. An unregistered target makes the command **illegal**, not inert: registration is scoped to the button's lifetime, so `Configure lanes` is simply absent on `/`.

- **Two actions reuse a Detail flow rather than reimplementing it.** `contexts/detail` exposes `useWorkspaceActions` + `WorkspaceActionModals` so `e` opens the real branch-name prompt (which carries the worktree-already-exists warning and the existing-MR-branch reuse) and `x` opens the real discard confirmation. Skipping either would have meant inventing behaviour the app does not have — a branch the user never saw, or a force-removed worktree on one keystroke.
