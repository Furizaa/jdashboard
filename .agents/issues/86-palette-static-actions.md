# 86 — Palette action list: the synchronous actions

**Type:** AFK

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The payoff slice: pressing `Enter` on a result opens that item's **action list**, and one keypress
runs an action. This slice covers every action whose legality can be decided **synchronously** from
data already in the cache. The two async / nested ones (status transitions, tags) are slice 87.

Actions in scope, with their PRD letters:

| Key     | Action                         | Legal when                            |
| ------- | ------------------------------ | ------------------------------------- |
| `↵`/`d` | Open detail                    | always                                |
| `n`     | Open Notes                     | Jira item                             |
| `w`     | Add to / Remove from Watchlist | Jira item (label flips on membership) |
| `o`     | Open in Jira                   | Jira item                             |
| `c`     | Copy Jira Link                 | Jira item                             |
| `y`     | Copy Issue Key                 | Jira item                             |
| `m`     | Open MR in GitLab              | an MR resolves for the item           |
| `v`     | Review MR                      | an MR resolves for the item           |
| `e`     | Open in Workspace              | no workspace open for the item        |
| `f`     | Focus Workspace                | a workspace is open for the item      |
| `x`     | Discard Workspace              | a workspace is open for the item      |

### View-model: the action state

Extend `view-model/palette-view-model.ts`'s union with an `actions` state carrying the selected
`WorkItem` and the highlighted action index. `Enter` on a result transitions `results → actions`;
`←` / `Backspace` transitions back, preserving the query and the previously selected result so
stepping in and out of an item is lossless.

`derive` gains the action list: given the state and the injected catalogue, it returns the ordered,
grouped, **legality-filtered** list. Illegal actions are **omitted, not disabled** — the PRD is
explicit that only legal actions are suggested. Keep `PaletteAction.enabled` in the type for the
transient case slice 87 needs (an action that exists but is momentarily not runnable while its data
loads); it is not a licence to render greyed-out rows here.

Extend `domain/palette-key-intent.ts` to resolve an action shortcut against `ACTION_SHORTCUTS`. Two
rules that matter:

- **The action list has no text filter.** Typing a letter _runs_ an action — that is the entire point
  of a curated static map. `j`/`k` and arrows still navigate, `Enter` runs the highlighted row.
- **A key bound to an action that is not currently legal does nothing** — it must not fall through to
  some other handler, and it must not close the palette. Test this explicitly.

### The catalogue: `src/routes/-command-palette/use-action-catalogue.ts`

The cross-context assembly. Returns `(item: WorkItem) => readonly PaletteAction[]`, wiring each
action's `run` to the hook that already implements it. Nothing here is new behaviour — it is all
existing capability, newly reachable:

- Open detail / Open Notes → router navigation (`?issue=KEY`, plus `notes=true`), board-relative
  (`to: '.'`) so the palette does not throw you off `/watchlist`.
- Add / Remove from Watchlist → `useRemoveFromWatchlist` exists; **`useAddToWatchlist` does not and
  must be added** to `contexts/watchlist/presenter/use-watchlist-mutations.ts` beside it, matching its
  shape, and re-exported through `~/coordinator`. Per the PRD this is a direct mutation — do **not**
  route it through `WatchlistModal`, whose only job is finding a ticket the palette has already found.
- Open in Jira / Copy link / Copy key → the same `window.open` and clipboard behaviour
  `use-issue-panel.ts` already has, including its success/failure toasts. Extract rather than
  reimplement if that is clean; duplicating the clipboard error handling is not acceptable.
- Open MR / Review MR → resolve the MR the way `OpenInWorkspaceButton.tsx` already does: an MR we
  authored (`useMrFor`) **or** one we are a reviewer on (scan `useReviewCards()` for a `review-real`
  card matching the key). That resolution logic is currently inline in
  `OpenInWorkspaceButton.tsx:findReviewMrIid` — lift it somewhere both callers can use rather than
  copying it.
- Open / Focus / Discard Workspace → `useWorkspaceOpen` / `useOpenWorkspaceKeys` decide legality;
  `openInWorkspace` needs the branch-name prompt flow that `OpenInWorkspaceButton` owns. **Decide and
  document**: either the palette action opens that existing prompt modal, or it takes the default
  branch name from `defaultWorkspaceName()` and skips the prompt. Do not silently invent a third
  behaviour. Discard is destructive — it must keep whatever confirmation the existing flow has.

### Presentation

- Each row prints its shortcut in a `<kbd>`, styled like the existing `⌘K` hint that was in
  `SearchInput.tsx`.
- Rows are grouped by `ActionGroup` with section headers.
- Fake review cards (`review-fake`) show only `m` and `v` — assert this in a test, since it is the
  clearest case of legality being derived rather than assumed.
- The palette closes on a successful action, except where the action's own UI takes over.
- Failures surface through the existing `sonner` toasts. The palette must not swallow an error: if a
  mutation fails, the user must see why.

## Acceptance criteria

- [ ] `Enter` on a result opens its action list; `←` / `Backspace` returns to results with the query
      and selected result intact.
- [ ] Every action in the table above is present, legal-only, with the PRD's letter, and runs.
- [ ] Illegal actions are **absent** from the list, not rendered disabled.
- [ ] Pressing a letter bound to a currently-illegal action is a no-op — the palette stays open and
      nothing else handles the key.
- [ ] Workspace actions are mutually exclusive: `e` when none is open; `f` and `x` when one is.
      `x` retains the existing confirmation.
- [ ] `w` flips label and behaviour on watchlist membership; `useAddToWatchlist` exists in
      `use-watchlist-mutations.ts` and is re-exported via `~/coordinator`.
- [ ] MR resolution (authored **or** reviewer-assigned) is shared with `OpenInWorkspaceButton` rather
      than duplicated.
- [ ] A `review-fake` item offers exactly `m` and `v` — covered by a unit test.
- [ ] Each row displays its shortcut in a `<kbd>`; rows are grouped by `ActionGroup`.
- [ ] `contexts/command-palette/` still imports no sibling context (`pnpm depcruise` green).
- [ ] Unit tests: legality derivation per item shape (Jira-backed, watchlist, `review-real`,
      `review-fake`; workspace open vs not; watchlist member vs not), and the
      results ↔ actions transitions.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green; `pnpm check:arch` no
      worse than master (advisory).
- [ ] e2e: open palette → find a ticket → `w` toggles watchlist membership; and → `y` copies the key.

## Blocked by

85.
