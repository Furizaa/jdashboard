# 89 — Palette: documentation refresh and e2e coverage

**Type:** HITL

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The slice that makes the feature legible to the next reader and locks its behaviour in CI. Slices
84–88 each carry their own tests and their own `CONTEXT.md`/ADR additions; this one closes the
architectural documentation that describes the codebase _as a whole_, and fills out the e2e folder.

HITL because the docs are the codebase's teaching surface — `README.md` states outright that
clashboard is a reference implementation and the canonical clean-architecture example for the team.
Prose quality is the deliverable, not a side effect. Precedent: slices 59, 61, and 68 are HITL for
the same reason.

### `CONTEXT-MAP.md`

- Add **Command Palette** to the Contexts table, with its purpose and key concepts.
- **Adopt `WorkItem` in the glossary.** It currently reads "_(candidate term — not yet adopted)_ — a
  thing on the board, regardless of source. Currently modelled as a discriminated union at the
  assembly layer; not a first-class type." That sentence is now false. Rewrite it as an adopted
  kernel term and point at `kernel/work-item.ts`.
- Add `work-item.ts` and `commands.ts` to the kernel module listing.
- Extend the dependency-law section with the palette's edges: the context imports `kernel` only
  (beyond the usual `design-system` / `lib`), and the cross-context assembly lives in
  `routes/-command-palette/`. Name the two new dependency-cruiser rules from slice 85.
- Note the new coordinator `Commands` port alongside `Cache` / `Toast` / `Navigate` / `Browser`.

### `README.md`

- The feature list still describes the app as having a search filter. Replace that with the palette,
  and mention the ⌘K entry point — it is the app's primary interaction now, not a detail.
- Add `.agents/prds/command-palette.md` to the PRD list.
- Add the palette to the folder-layout block.
- The "read this codebase in order" list is the most valuable thing in the README; make sure the
  palette is reachable from it rather than only discoverable by grep.

### A shortcut reference

The curated static map is only an advantage if it is discoverable. Two surfaces, and they must not
drift from `ACTION_SHORTCUTS`:

- **In-app**: a help view in the palette itself (`?` from the root level) listing every action and its
  key, generated from `ACTION_SHORTCUTS` rather than hand-written. Hand-written would rot on the first
  added action.
- **In the docs**: a table in `docs/` or the palette's `CONTEXT.md`. Since this one cannot be
  generated, say explicitly where the source of truth lives so a future reader updates the map and not
  just the prose.

### `docs/architecture.svg`

Regenerate with `pnpm docs:arch` and commit. README calls this SVG "the source of truth for which
import edges are allowed", so a stale one is a documentation bug. Requires Graphviz (`dot`) on PATH.

### e2e folder

Following the per-folder convention from slices 44–50, add `tests/e2e/command-palette/` covering the
flows that the unit tests cannot: real keyboard events, real focus management, real navigation.

- Open / close, and ⌘K not hijacking focus from another text input.
- Search finding an assigned ticket, a watchlist card, and a review card — **from both board routes**,
  since route-independent search is the feature's core promise.
- A ticket present in two sources appearing once.
- The three-deep navigation stack: back out of a sub-list, back out of actions, query preserved.
- One action per category: a transition (`s`), a tag toggle (`t`), a watchlist toggle (`w`), a
  hand-off (`r`), a global command (New Ticket).
- Legality: a `review-fake` card offering only `m` / `v`; `Configure Lanes` absent on `/`.
- Board filter applied and cleared via the palette, with the header chip appearing and disappearing.

Mock at the network boundary per ADR-0001 — do not reach for component-level mocks.

### Final check

Run the full gate set, including `pnpm test:e2e`. Then do the thing the PRD is actually asking for:
**drive a full triage session — find, transition, tag, note, refine — without touching the mouse.**
If any step forces a reach for the trackpad, that is a finding for this slice, not a follow-up.

## Acceptance criteria

- [ ] `CONTEXT-MAP.md`: palette added to the Contexts table; `WorkItem` rewritten as an adopted term
      (the "candidate term — not yet adopted" wording is gone); `work-item.ts` and `commands.ts` in
      the kernel listing; the palette's edges and the two new rules named in the dependency law; the
      `Commands` port listed with the other coordinator ports.
- [ ] `README.md`: search-filter wording replaced with the palette and its ⌘K entry point; the PRD
      linked; the folder layout updated; the palette reachable from the reading order.
- [ ] An in-app shortcut help view opens with `?` from the palette root and is **generated from**
      `ACTION_SHORTCUTS`, not hand-maintained.
- [ ] A shortcut table exists in the docs and names `kernel/commands.ts` as the source of truth.
- [ ] `docs/architecture.svg` regenerated and committed.
- [ ] `tests/e2e/command-palette/` covers every flow listed above, mocking at the network boundary
      per ADR-0001.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.
- [ ] `pnpm check:arch` no worse than master (advisory — it already fails on master on pre-existing
      circular deps and intentional per-context duplication).
- [ ] A full mouse-free triage session has been walked by hand; anything that forced a mouse reach is
      either fixed here or written up as a named follow-up.

## Blocked by

87, 88.
