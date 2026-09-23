# Command Palette — PRD

## Problem

clashboard's search is a text box that narrows the board in place. That is a _filter_, not a
workflow. Acting on what you find still means reaching for the mouse: click the card, click the
status pill, pick a transition; or open the panel, scroll the rail, click "Add tag".

Every action the app supports is reachable only from the surface that owns it. There is no single
place to go from "I'm thinking about KOD-1234" to "KOD-1234 is now in Code Review" without
touching the trackpad.

## Goal

A Raycast-style command palette on ⌘K that is the **primary** way a power user drives the board:

1. ⌘K opens a popup with a query field.
2. Typing searches **every work item on the board** — Jira-assigned tickets, watchlist cards, and
   MR-review-assigned cards — across all three sources at once, regardless of which board route
   you happen to be on.
3. ↑/↓ moves through results.
4. **Enter on a result opens that item's action list** — every action currently legal for that
   item, each with a keyboard shortcut printed beside it.
5. One keypress runs the action.

The success test: **a full working session — triage, status changes, tagging, notes, AI refine —
without touching the mouse.**

Non-goal for this PRD: direct keyboard navigation of the board grid itself (a focus ring moving
between columns and cards). That is a natural follow-up which reuses this PRD's action catalogue
wholesale, and is deliberately deferred so the palette lands first.

## Product decisions

These were settled before implementation and are not open for relitigation without a new decision
record.

### The palette replaces board filtering

The header search box (`routes/-header/SearchInput.tsx`) is **deleted**. Narrowing the board
becomes a palette command rather than a separate control, so there is exactly one search surface in
the app.

The mechanism avoids a second input: whatever you have already typed into the palette _is_ the
filter text. A root-level command **"Filter board by '‹query›'"** appears as you type; running it
applies the text to the current board's filter and closes the palette. An active filter shows as a
chip in the header where the search box used to be, and a **"Clear board filter"** command becomes
legal only while a filter is active.

Consequence accepted: you no longer get live board narrowing as you type with results visible
behind the palette. Filtering is now a deliberate action.

### Shortcuts are a curated static map, not positional

Each _action kind_ owns a fixed letter, declared once in `kernel/`. The same key always means the
same thing regardless of which actions happen to be legal for the item in front of you, so muscle
memory forms. Positional digits (`1`–`9`) were rejected for exactly that reason — the key for an
action would shift as legality changed.

⌘-modified shortcuts (Raycast's own scheme) were rejected because ⌘T, ⌘N, and ⌘W are owned by the
browser and cannot be reliably intercepted in a web app.

`j`/`k` are reserved for list navigation everywhere, matching the detail panel's existing bindings.
`o` (open in Jira) and `c` (copy link) keep the meanings `contexts/detail/domain/panel-key-intent.ts`
already gives them.

| Key     | Action                         | Legal when                            |
| ------- | ------------------------------ | ------------------------------------- |
| `↵`/`d` | Open detail                    | always                                |
| `s`     | Change Status… _(sub-list)_    | Jira item                             |
| `n`     | Open Notes                     | Jira item                             |
| `t`     | Tags… _(sub-list)_             | Jira item, ≥1 tag defined             |
| `w`     | Add to / Remove from Watchlist | Jira item (label flips on membership) |
| `r`     | AI Refine                      | Jira item                             |
| `a`     | AI Ask                         | Jira item                             |
| `o`     | Open in Jira                   | Jira item                             |
| `c`     | Copy Jira Link                 | Jira item                             |
| `y`     | Copy Issue Key                 | Jira item                             |
| `m`     | Open MR in GitLab              | an MR resolves for the item           |
| `v`     | Review MR                      | an MR resolves for the item           |
| `e`     | Open in Workspace              | no workspace open for the item        |
| `f`     | Focus Workspace                | a workspace is open for the item      |
| `x`     | Discard Workspace              | a workspace is open for the item      |

Fake review cards (`kind: 'review-fake'` — an MR with no resolvable Jira key) get only `m` and `v`,
since there is no ticket to act on.

### Only legal actions are offered

Legality is **derived from item state, never hardcoded per surface**:

- Remove-from-Watchlist only when the item is a member; Add-to-Watchlist only when it is not.
- Focus/Discard Workspace only when one is open; Open-in-Workspace only when none is.
- Remove-tag only for attached tags; attach only for unattached ones.
- Open/Review MR only when an MR resolves (authored, or one we are a reviewer on).
- Status transitions come from Jira per ticket and are **async** — see below.

### Actions needing input hand off to what already exists

Where a flow already has a working UI, the palette routes to it rather than re-hosting it:

- **AI Refine / AI Ask** are coupled to the note editor (`useRefineModal` adopts refined content
  into it) and are mounted inside `NotesPanel`, so they cannot be hoisted. The palette navigates to
  `?issue=KEY&notes=true&ai=refine|ask`, extending the URL mechanism `notes=true` already uses.
- **New Ticket, Manage Tags, Bulk Refine, Add-to-Watchlist-by-search, Configure Lanes** open their
  existing header modals.

Two actions that _looked_ like they needed hand-off do not:

- **Attach tag has no modal** — it is an inline popover inside `contexts/detail/view/TagControls.tsx`,
  reachable only with the panel open. So `t` becomes a nested palette sub-list, reusing the exact
  mechanism `s` already needs. No new UI concept.
- **Add to Watchlist needs no input** — `addToWatchlist({ key })` is a direct mutation. The existing
  modal exists only to _find_ a ticket, which the palette has already done. So `w` is a direct toggle.

## Architecture

The palette is inherently cross-context: it searches Board + Watchlist + Review and executes actions
owned by Detail, Tags, Watchlist, and Capture. `.dependency-cruiser.cjs`'s `no-cross-context` rule
forbids `contexts/A → contexts/B`, so the naive shape would need six new forbidden edges.

**The palette context owns the flow and knows nothing about any other context.** It consumes plain
descriptors:

```ts
type PaletteAction = {
  kind: ActionKind // discriminated union in kernel/, matched exhaustively
  label: string
  enabled: boolean
  run: () => void
}
```

The cross-context **assembly** of those descriptors lives in `routes/-command-palette/`, because
`routes/` is already the only place multiple contexts compose (ADR-0007). Zero new dependency edges.
This is the same idiom the codebase already uses for `navigate`, which view-models receive as an
injected plain function rather than importing the router.

`WorkItem` — listed in CONTEXT-MAP's glossary as a _candidate term, not yet adopted_ ("a thing on the
board, regardless of source") — is promoted to a real `kernel/` type. A palette searching all three
sources is the use-case that earns it, and it gives one place to dedupe: an assigned ticket may also
be on the watchlist, and a real review card carries a Jira key.

Deliberately **not** adding `cmdk`: it would own the state ADR-0003 requires the view-model to own,
and CONTEXT-MAP already skips libraries on that reasoning. Radix Dialog is in, and
`design-system/dialog.tsx` exists.

The palette has **no `application/` layer** — it owns no gateway; its data arrives injected. This
matches `contexts/tags/`, whose CONTEXT.md table also lists only view-model / presenter / view.

Opening the five header modals needs one new coordinator port plus a small React adapter
(`coordinator/adapters/command-bus.tsx`) exposing `register` / `open`. Each header button gains a
one-line `useRegisterCommand(...)`. The buttons already own their open state internally, so
registering an opener upward is far less churn than lifting five modals into the shell.

## Layout

```
src/kernel/
  work-item.ts                    # WorkItem union, key/haystack/dedupe
  commands.ts                     # ActionKind union, ACTION_SHORTCUTS, ActionGroup

src/contexts/command-palette/
  CONTEXT.md
  domain/                         # pure: ranking, key→intent
  view-model/                     # reduce + derive; no React
  presenter/                      # ⌘K listener, focus, reducer binding
  view/                           # CommandPalette + results + actions + footer

src/coordinator/
  adapters/command-bus.tsx        # register / open for the five header modals
  ports.ts                        # + Commands port

src/routes/
  -command-palette/
    use-palette-items.ts          # board + watchlist + review → WorkItem[], deduped
    use-action-catalogue.ts       # THE cross-context assembly (legal here)
  -app-shell.tsx                  # mounts the palette; owns board filter state
  -header/Header.tsx              # SearchInput deleted → active-filter chip
```

## Slices

| #                                                      | Slice                                                    |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [84](../issues/84-palette-kernel-work-item.md)         | Kernel: `WorkItem` + shortcut map + ADR-0008             |
| [85](../issues/85-palette-spine.md)                    | Palette spine: ⌘K, cross-source search, filter migration |
| [86](../issues/86-palette-static-actions.md)           | Synchronous action list                                  |
| [87](../issues/87-palette-nested-sublists.md)          | Nested sub-lists: status transitions + tags              |
| [88](../issues/88-palette-handoffs-global-commands.md) | Hand-offs + global commands                              |
| [89](../issues/89-palette-docs-and-e2e.md)             | Docs refresh + e2e coverage                              |

## Out of scope

- Board-grid focus ring / direct card navigation (the natural follow-up; reuses the catalogue).
- Fuzzy-match libraries — ranking is a pure domain function over the existing haystack shape.
- Multi-select / bulk actions across several work items at once.
- User-remappable shortcuts. The map is curated and fixed.
- Palette-hosted forms. Input-bearing actions hand off (see above).
