# Command Palette

⌘K opens a popup that searches **every work item on the board at once** — assigned Jira tickets, watchlist cards, and GitLab review cards — regardless of which board route you are on, and runs any action legal for the one you pick. It is the primary way a power user drives clashboard: the target is a full triage session without touching the mouse.

It also owns **board filtering**. The header search box is gone; whatever you have typed into the palette _is_ the filter text, applied by a root-level command and shown afterwards as a chip in the header where the box used to be. One search surface in the app, at the cost of live narrowing as you type.

## The cross-context problem, and why this context imports nothing

The palette searches Board + Watchlist + Review and executes actions owned by Detail, Tags, Watchlist, Capture, and Bulk Refine. `no-cross-context` forbids `contexts/A → contexts/B`, so the naive shape would need six new forbidden edges.

Instead **this context owns the flow and knows nothing about any other context.** Items arrive as `WorkItem[]`; actions and commands arrive as plain `PaletteAction` / `PaletteCommand` descriptors whose `run` closes over whatever hook implements them. The cross-context **assembly** lives in `src/routes/-command-palette/`, because `routes/` is already the only place multiple contexts compose (ADR-0007). Zero new dependency edges — see [ADR-0008](../../../docs/adr/0008-command-palette-action-catalogue.md).

This is the same idiom the codebase already uses for `navigate`: an injected plain function rather than an imported router.

## Layers

There is **no `application/` layer**, and its absence is the design: the palette owns no gateway and performs no I/O. Its data arrives injected from `routes/`, and every effect is inside somebody else's `run` callback. `contexts/tags/` is the existing precedent for a context with only view-model / presenter / view.

| Layer          | File(s)                            | Role                                                                                |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **Domain**     | `domain/rank-items.ts`             | Pure: term matching + key-strength ranking over `workItemHaystack`.                 |
|                | `domain/palette-key-intent.ts`     | Pure: `KeyboardEvent` → `PaletteIntent`, per navigation level.                      |
|                | `domain/palette-descriptors.ts`    | The injected vocabulary: `PaletteAction`, `PaletteCommand`, sections, source notes. |
| **View-model** | `view-model/palette-view-model.ts` | `reducePalette` + `derivePalette`. No React import.                                 |
| **Presenter**  | `presenter/use-command-palette.ts` | The ⌘K listener, focus handoff, reducer binding. The only React-bound module.       |
| **View**       | `view/CommandPalette.tsx`          | Radix dialog + query field; renders `display` and forwards keystrokes.              |
|                | `view/PaletteResults.tsx`          | Grouped rows with the keyboard highlight.                                           |
|                | `view/PaletteEmpty.tsx`            | No-match state, qualified by what has not loaded.                                   |
|                | `view/PaletteFooter.tsx`           | Keyboard hints + loading / unavailable source notes.                                |

`cmdk` is deliberately not adopted: it would own the query, selection, and navigation state that ADR-0003 assigns to the view-model. Radix Dialog (already in `design-system/dialog.tsx`) is the only primitive needed.

## Language

**Work item** (kernel `WorkItem`): a thing the palette can find, from any of the three sources. The distinction the whole feature reads off it is `workItemJiraKey(item) !== null` — "is there a Jira ticket behind this?" — which gates almost every action's legality. A `review-fake` card is an MR with no resolvable key, so there is no ticket to transition, tag, or note.

**Action** (`PaletteAction`): one thing legal for one work item, keyed by `ActionKind` from `kernel/commands.ts`. **Command** (`PaletteCommand`): a board-level action belonging to no work item, `Enter`-only — the root level owns a text query, so a bare letter there types rather than runs.

**Hand-off**: an action that routes to an existing UI instead of re-hosting it. `r` / `a` navigate to `?issue=KEY&notes=true&ai=refine|ask` because Refine and Ask are coupled to the note editor (`useRefineModal` adopts refined content into it) and mounted inside `NotesPanel`. The five header modals are opened through the coordinator's **command bus**: each button registers an opener, the palette calls `open(target)`, and a target with no registered opener is **not offered** — `Configure lanes` exists on `/watchlist` alone.

**Legality**: whether an action is offered at all, derived from item state and never hardcoded per surface. Illegal actions are **absent**, not disabled — `PaletteAction.enabled` is reserved for the transient case, an action that exists but whose data is still in flight. There is no `if (isReviewFake)` anywhere: a fake review card simply has no Jira key, so every ticket-shaped action falls away and only `m` / `v` survive.

**Sub-list** (`PaletteSubList`): a nested list opened by an action instead of running it — `s` for status transitions, `t` for tags. The two are shaped differently on purpose: **transitions are asynchronous and per-ticket** (Jira decides what a ticket can become, so the list has loading and _failed_ arms, and a failure must not look like "no transitions exist"), where **tags come from the cache** and have neither. Forcing one shape would mean pretending a tag list can be loading.

The transition fetch fires when an item's **action list** is entered, not per search result — the palette announces its active item to the host for exactly that reason, so typing never fans out a request per row. A ticket with no transitions loses `s` entirely; because that is only knowable after the fetch, `s` is offered while the answer is unknown and the sub-list says what happened.

The tag list **stays open** after a toggle, because several tags usually get set in one visit. The action list and the transition list both close on success. That difference is intentional.

**Section**: a root-level result group — Assigned to me · Watchlist · Review · Commands. Grouping by source is what makes it obvious whether a hit is your own work, something you only advise on, or an MR waiting on your review.

**Source note** (`PaletteSourceNote`): a source that is not contributing yet, `loading` or `unavailable`. Kept distinct because "empty because GitLab is still answering" and "empty because GitLab returned 401" are different claims about the same empty list.

_Avoid_: "filter" for what the palette does to its own list (that is **ranking**; "filter" is reserved for what a command applies to the board), and "search box" (deleted — it was the thing this replaces).

## View-model state machine

```
closed ─(⌘K)─▶ open ─(↵ on a result)─▶ actions ─(s / t)─▶ sub-list
   ▲            │  ▲                      │  ▲              │
   └─(Esc/⌘K)───┘  └───────(← / ⌫)────────┘  └───(← / ⌫)────┘
   └────────────────(Esc, from any depth)───────────────────┘

open     { query, selected }
actions  { query, selected, itemId, actionIndex }
sub-list { query, selected, itemId, actionIndex, subList, subIndex }
```

The status **is** the navigation level, and each deeper level carries the shallower one's fields, so backing out of a level with the query and the selected result intact is structural rather than something the reducer has to remember. `Esc` closes from any depth; `← / ⌫` pops exactly one — conflating them would mean losing your query because you backed out of an action list.

The deep levels hold the item by `workItemId`, not by index, so a board refresh that reorders the results cannot silently retarget an action. If the item disappears entirely (a Done ticket drops off, a watchlist removal lands) `derive` falls back to the results list rather than rendering an action list for nothing.

The reducer is one small function per level dispatched on the level, with an `exhaustive()` over the union — so adding a level is a compile error until it has rules of its own.

Two deliberate splits of responsibility:

- The reducer **wraps** the highlight (a list you can run off the end of feels broken) but is given the row count by the event, since it holds no derived data.
- `derive` **clamps** the highlight, because the list shrinks under it whenever a source finishes loading or a mutation lands — and only `derive` knows how long the list is.

## Keyboard

Shortcuts are a curated static map in `kernel/commands.ts` (`ACTION_SHORTCUTS`) — **that file is the source of truth**; any table elsewhere, including this one, is a copy. Per-item action letters arrive with the action list.

| Level  | Keys                    | Meaning                    |
| ------ | ----------------------- | -------------------------- |
| any    | `⌘K` / `Ctrl-K`         | Toggle the palette         |
| any    | `Esc`                   | Close from any depth       |
| root   | `↑` / `↓`               | Move the highlight (wraps) |
| root   | `↵`                     | Open the highlighted row   |
| `list` | `↑`/`↓` **and** `j`/`k` | Move the highlight         |
| `list` | `←` / `Backspace`       | Pop exactly one level      |

`j`/`k` navigate only at a `list` level. At root they type, because **the root level owns the query field** — a palette you cannot type "kod" into is not a search box. This is a deliberate narrowing of the PRD's "`j`/`k` everywhere": the detail panel's bindings work because it has no text input, and the palette cannot have it both ways with one input.

For the same reason global commands are `Enter`-only rather than keyed. Both asymmetries are recorded in ADR-0008.

## Cross-context dependencies

- `~/kernel` — `WorkItem` and its accessors, `ActionKind` / `ACTION_SHORTCUTS` / `ActionGroup`, `REVIEW_BUCKET_STATUS_NAME`.
- `~/design-system` — `Dialog`; `~/lib` — `cn`, `testIds`.
- Nothing else. **No `~/coordinator` and no `~/contexts/<other>`**, enforced by `command-palette-domain-only-imports-kernel` and `command-palette-view-model-only-imports-kernel-and-domain` plus the generic `no-cross-context` rule. The presenter and view are held to the same line by convention and by the fact that the descriptors leave nothing to reach for.

The assembly that _does_ touch everything lives in `src/routes/-command-palette/`:

| File                     | Role                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `use-palette-items.ts`   | Board + Watchlist + Review → deduped `WorkItem[]`, plus per-source notes. |
| `use-board-commands.ts`  | The board-filter commands (and, later, the rest of the global set).       |
| `CommandPaletteHost.tsx` | Composition root: mounts the palette with plain values and functions.     |

## Public surface

```ts
export { CommandPalette } from './view'
export type {
  PaletteAction,
  PaletteCommand,
  PaletteCommandSource,
  PaletteSourceNote,
} from './domain'
```

`CommandPalette` is mounted once per board route by `AppShell`. The descriptor types are exported because `routes/` has to build them; everything else — the state machine, the ranking, the key map — is internal.
