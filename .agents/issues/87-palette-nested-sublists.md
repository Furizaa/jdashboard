# 87 — Palette sub-lists: status transitions and tags

**Type:** AFK

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The two actions that open a **nested list** instead of running immediately. Together they are the
feature's headline workflow — "⌘K, type a key, `s`, pick Code Review" is the move the whole PRD
exists to enable.

Both reuse one mechanism, built once here.

### `s` — Change Status…

Transitions are **per-ticket and async**: they come from Jira via `getTransitions(key)`
(`useTransitions(key, enabled)` already exists and is already used by the status pill). This is the
one place in the feature where the action list cannot be fully known synchronously, so the sub-list
needs a real loading state.

- Fetch is triggered when the item's action list is entered — not per search result. Searching must
  not fan out a request per row.
- The sub-list has three states: loading, loaded (the legal transitions for this ticket), and failed.
  **Failure must be visible**, not an empty list that looks like "no transitions exist".
- Running a transition goes through `useTransitionAction()` — the coordinator's existing
  `applyTransition`, which already does the optimistic board + panel patch, the rollback on failure,
  and the toast. Do not reimplement any of that.
- Selection within the sub-list is by arrows / `j`/`k` + `Enter`, plus digits `1`–`9` as a shortcut
  for the first nine transitions. Digits are acceptable _here_ — inside a short, dynamic, homogeneous
  list — where they were rejected for the main action list. The reasoning is worth a comment.
- A ticket with **no** legal transitions must not offer `s` at all (legality derived, per the PRD).
  Note this is only knowable after the fetch: `s` may therefore appear and then become a no-op list.
  Handle it honestly — show "no transitions available" rather than silently closing.

### `t` — Tags…

Per the PRD, tag attach has **no existing modal** — it is an inline popover inside
`contexts/detail/view/TagControls.tsx`, reachable only with the detail panel open. So `t` is a
sub-list, using the same mechanism as `s`. This is cheap because the mechanism now exists.

- Lists every tag definition (`useTagDefinitions`) with attached state for this ticket
  (`useTicketTags`), as a **toggle** list: `Enter` on an attached tag detaches, on an unattached tag
  attaches. Show the attached state clearly, and render each tag in its own colour via
  `resolveTagColor` so it matches the chips on the card and in the panel.
- Wires to `useAttachTag` / `useDetachTag`, both already re-exported from `~/coordinator`.
- The sub-list **stays open** after a toggle so several tags can be set in one visit. This differs
  from the main action list, which closes on success — an intentional difference worth a comment.
- `t` is illegal when no tags are defined, matching what `TagControls` already does (it shows "No tags
  defined — add some from the Tags menu"). The palette should point somewhere useful rather than
  offering a dead end: consider surfacing the Manage Tags command instead. Coordinate with slice 88,
  which adds that command.
- Tag data is synchronous from cache, so `t` has no loading state — only `s` does. Do not force a
  shared shape that pretends otherwise.

### Shared mechanism

Extend `view-model/palette-view-model.ts` with a `sub-list` state carrying which sub-list is open,
its items, and the highlighted index. Navigation stack is three deep: `results → actions → sub-list`.
`←` / `Backspace` pops exactly one level; `Escape` closes the whole palette from any depth. Those two
must not be conflated — losing your query because you backed out of a status list would be
infuriating.

Model the async case as part of the sub-list state rather than bolting a boolean onto the open state.
`ts-pattern.exhaustive()` over the result should make the loading and failed arms impossible to
forget.

## Acceptance criteria

- [ ] `s` on a Jira-backed item opens a transition sub-list; transitions are fetched on entering the
      item's action list, not per search result.
- [ ] The sub-list renders distinct loading, loaded, and **failed** states; failure is visibly
      different from "no transitions".
- [ ] Picking a transition calls the coordinator's existing `applyTransition` — the optimistic patch,
      rollback, and toast all still work, verified by watching a failing transition roll back.
- [ ] Digits `1`–`9` select among the first nine transitions; arrows / `j`/`k` + `Enter` also work.
- [ ] A ticket with no legal transitions does not offer `s`; if that is only discovered after the
      fetch, the sub-list says so explicitly.
- [ ] `t` opens a tag sub-list showing every definition with its attached state and its own colour;
      `Enter` toggles attach/detach via the existing hooks.
- [ ] The tag sub-list stays open after a toggle; the main action list still closes on success.
- [ ] `t` is absent when no tags are defined.
- [ ] `←` / `Backspace` pops exactly one navigation level and preserves the query; `Escape` closes
      the palette from any depth.
- [ ] `contexts/command-palette/` still imports no sibling context (`pnpm depcruise` green); the
      view-model still has no React import.
- [ ] Unit tests: the three-deep navigation stack including back-out at each level; the async
      sub-list's loading / loaded / failed arms; tag toggle in both directions; `s` absent with no
      transitions and `t` absent with no definitions.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green; `pnpm check:arch` no
      worse than master (advisory).
- [ ] e2e: ⌘K → type a key → `s` → pick a transition → the card moves column. And: ⌘K → `t` → toggle
      a tag → the chip appears on the card.

## Blocked by

86.
