# 88 — Palette hand-offs and global commands

**Type:** AFK

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The last two pieces that make the palette cover **every** action the app supports: the per-item
actions that hand off to an existing UI, and the board-level commands that are not attached to any
work item.

### AI hand-off: `r` (Refine) and `a` (Ask)

Per the PRD these cannot be hoisted out of the detail panel. `useRefineModal(issueKey, editor.adoptContent)`
is wired to the note editor so refined content can be adopted into it, and both modals are mounted
inside `NotesPanel`. Re-hosting them in the palette would mean duplicating two multi-round grilling
flows — explicitly out of scope.

The hand-off goes through the URL, extending the mechanism `notes=true` already uses:

- Add `ai?: 'refine' | 'ask'` to `BoardSearch` and `validateBoardSearch()` in `routes/-app-shell.tsx`.
  Validate it the same defensive way `notes` is validated, and make it meaningless without `issue`
  (like `notes` already is). Both board routes share this schema, so it works from either.
- `NotesPanel` reads the param and auto-opens the requested modal once. Clear the param when the
  modal closes so a refresh or a back-navigation does not silently reopen it — this is the detail
  most likely to be got wrong.
- The palette's `r` / `a` navigate to `?issue=KEY&notes=true&ai=refine|ask` and close.

Both are legal on any Jira-backed item. Neither is legal on a `review-fake` card.

### The command bus, and the five header modals

`New Ticket`, `Manage Tags`, `Bulk Refine`, `Add to Watchlist` (the search-based one), and
`Configure Lanes` each live in a header button that owns its own open state internally
(`QuickCreateButton`, `TagManagerButton`, `BulkRefineButton`, `WatchlistButton`, `LaneConfigButton` —
all five follow the same `useX()` + controlled-modal shape).

Add a **`Commands` port** to `coordinator/ports.ts` plus a React adapter
`coordinator/adapters/command-bus.tsx` exposing `register(target, opener)` and `open(target)`. Each
button gains a one-line `useRegisterCommand(...)`; the palette calls `open(target)`.

Why this rather than lifting the five modals' state into `AppShell`: registering an opener upward is
one line per button, where lifting would change five contexts' public surfaces and split each button
from its modal. The adapter is React, which is legal in `coordinator/adapters/` — the
`coordinator-effects-only-in-adapters` rule permits exactly this, and `coordinator/provider.tsx` is
the existing precedent. Confirm with `pnpm depcruise`.

Two things to handle deliberately:

- **A target with no registered opener must degrade gracefully**, not throw. `Configure Lanes` only
  exists on `/watchlist`, so its button — and therefore its registration — is absent on `/`. Either
  make the command illegal when unregistered (preferred: it is honest, and matches "only legal
  actions are suggested") or navigate to `/watchlist` first and then open it. Pick one, comment it.
- **Registration must not leak.** Unregister on unmount, or the bus will hold a stale opener after a
  route change.

### Global commands

Root-level commands, shown under a "Commands" group — listed when the query is empty, and matched by
the same ranking function when it is not. They should be findable by their obvious name, so a
synonym or two per command in the searchable text is worth it ("New Ticket" should match "create").

- New Ticket · Add to Watchlist… · Manage Tags… · Bulk Refine… · Configure Lanes… (via the bus)
- Go to Board · Go to Watchlist (router navigation)
- Refresh (`useRefreshAll`)
- Toggle Only Workspace — main board only, reflecting the current state in its label
- Filter board by '‹query›' · Clear board filter — already landed in slice 85; make sure they sit in
  this group consistently rather than floating

Route-scoped commands must be **legality-filtered by route**, the same way the header already varies
by `BoardVariant`: `Only Workspace` is main-board-only and `Configure Lanes` is watchlist-only, per
ADR-0007's reasoning. The palette must not offer a command that the current board cannot honour.

Assign shortcuts from `ACTION_SHORTCUTS` where a global command has a natural letter, and let the rest
be `Enter`-only. Do not invent a second shortcut map — if a global command deserves a key, it belongs
in the kernel map from slice 84, and the collision assertion there covers it.

## Acceptance criteria

- [ ] `BoardSearch` / `validateBoardSearch()` accept `ai: 'refine' | 'ask'`, validated defensively and
      meaningless without `issue`; it works from both board routes.
- [ ] `r` and `a` navigate to the ticket with notes open and auto-open the right modal, once.
- [ ] Closing the modal clears the `ai` param — a refresh or back-navigation does not reopen it.
- [ ] `r` / `a` are legal on Jira-backed items and absent on `review-fake` cards.
- [ ] `coordinator/ports.ts` declares a `Commands` port; `coordinator/adapters/command-bus.tsx`
      implements `register` / `open`; all five header buttons register their opener in one line each.
- [ ] Registrations are cleaned up on unmount (no stale openers after a route change).
- [ ] An unregistered target degrades gracefully — the chosen behaviour is implemented, commented,
      and tested. Nothing throws.
- [ ] All global commands listed above are present, findable by name and by at least one synonym, and
      run.
- [ ] `Only Workspace` is offered only on `/`; `Configure Lanes` only on `/watchlist`.
- [ ] No second shortcut map exists — every keyed command draws from `ACTION_SHORTCUTS`.
- [ ] `contexts/command-palette/` still imports no sibling context; `pnpm depcruise` green, including
      the coordinator adapter rules.
- [ ] Unit tests: route-scoped legality for both variants; the unregistered-target path; the `ai`
      param validator (valid, invalid, and present-without-`issue`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green; `pnpm check:arch` no
      worse than master (advisory).
- [ ] e2e: ⌘K → "New Ticket" opens quick-create; ⌘K → a ticket → `r` lands in the refine modal.

## Blocked by

86. (Independent of 87 — the two can land in either order, but both extend the same action list, so
    expect to resolve a conflict in the view-model if they are worked in parallel.)
