# 85 — Palette spine: ⌘K, cross-source search, and the board-filter migration

**Type:** HITL

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The palette as a working surface, end to end, with **no per-item action list yet**. After this slice
you can hit ⌘K anywhere in the app, type, see ranked results drawn from all three sources, move
through them with the keyboard, and open one. The header search box is gone and board filtering has
moved into the palette.

HITL because this introduces a brand-new visual surface. The popup's proportions, typography,
grouping, and empty/loading states want a human eye — treat the existing modals
(`design-system/dialog.tsx`, `BulkRefineModal`, `WorkspaceModal`) as the visual reference so it
reads as part of the same app rather than a bolted-on widget.

### The new context: `src/contexts/command-palette/`

The context **must not import any other context** — `no-cross-context` enforces this. Its data and
its actions arrive injected as props / arguments. Verify with `pnpm depcruise`, not by eye.

- **`domain/rank-items.ts`** — pure `(items: readonly WorkItem[], query: string) => readonly WorkItem[]`.
  Start from the semantics `contexts/board/domain/filter-issues.ts` already has (whitespace-split
  terms, every term must match, case-insensitive) over `workItemHaystack`, then add ranking: an exact
  or prefix match on the Jira key should outrank a mid-summary substring hit, because typing a key
  you already know is the single most common palette action. No fuzzy-match library.
- **`domain/palette-key-intent.ts`** — pure `KeyboardEvent → PaletteIntent | null`, mirroring the
  shape of `contexts/detail/domain/panel-key-intent.ts`. Covers navigation and dismissal only in this
  slice (`next`, `prev`, `enter`, `back`, `close`); action shortcuts arrive in slice 86.
- **`view-model/palette-view-model.ts`** — framework-free reducer + derive. No React import. States:
  `closed`, and an open state carrying the query and the selected index. `derive(state, items)`
  produces the display list. Keep the discriminated-union-plus-`ts-pattern.exhaustive()` idiom used
  by the other view-models; slices 86–87 will add `actions` and sub-list states to this same machine,
  so leave the union shaped to grow.
- **`presenter/use-command-palette.ts`** — the only React-bound piece: the global ⌘K listener, focus
  management for the query input, and binding the reducer. Reuse the guard logic from
  `routes/-header/SearchInput.tsx` (`isModK`, and not hijacking ⌘K while the user is typing in
  another text input) — that behaviour is already correct and should not regress.
- **`view/`** — `CommandPalette.tsx` plus siblings (`PaletteResults`, `PaletteEmpty`, `PaletteFooter`).
  Results are grouped by source so it is obvious whether a hit is assigned work, a watchlist item, or
  a review card. The footer is where the shortcut hints live and is what slice 86 fills out.
- **`CONTEXT.md`** — per-context glossary, layer table, and view-model state machine, following the
  format of `contexts/watchlist/CONTEXT.md`. State explicitly that there is **no `application/` layer**
  and why (no gateway; data arrives injected), so the next reader does not go looking for it.
- **`index.ts`** — exports `CommandPalette` only.

### The cross-context assembly: `src/routes/-command-palette/use-palette-items.ts`

Where the three sources are read and unified. This lives in `routes/` precisely because it is allowed
to touch every context (ADR-0007, and ADR-0008 from slice 84).

Reads `useBoardData()`, `useWatchlistCards()`, and `useReviewCards()` — all three already re-exported
from `~/coordinator` — maps each into `WorkItem`, concatenates, and runs `dedupeWorkItems`.

Two things to get right:

- **Sources load independently.** Return whatever has arrived rather than blocking on all three; a
  slow GitLab call must not stop you finding an assigned ticket. Surface partial state honestly in the
  footer (e.g. "review cards still loading") instead of silently showing an incomplete list.
- **Search spans all sources regardless of route.** Being on `/watchlist` must not hide assigned
  tickets from the palette. This is the whole point of the feature.

### Board-filter migration

Per the PRD, the header search box is deleted and filtering becomes a palette command.

- Delete `src/routes/-header/SearchInput.tsx` and its use in `Header.tsx`. Move its ⌘K guard logic
  into the palette presenter first so nothing is lost.
- `routes/-app-shell.tsx` keeps owning `searchQuery` (per-route local state, per ADR-0007) and passes
  a setter down into the palette's command set.
- Add two root-level commands. **"Filter board by '‹query›'"** interpolates whatever is currently
  typed, applies it, and closes — no second input. **"Clear board filter"** is legal only while a
  filter is active.
- Replace the search box with an **active-filter chip** in the header showing the current filter text
  with a clear affordance, so an applied filter is never invisible. `Escape` while the chip is focused
  clears it.
- `testIds` entries for the palette root, query input, result rows, and the filter chip, following the
  naming style already in `src/lib/testids.ts`.

### Governance

Add dependency-cruiser rules for the new context now, at `error` severity, alongside the existing
per-context rules in `.dependency-cruiser.cjs`:

- `command-palette-domain-only-imports-kernel`
- `command-palette-view-model-only-imports-kernel-and-domain`

The generic `no-cross-context` rule already forbids the palette importing a sibling context; confirm
it actually fires by temporarily adding such an import, watching `pnpm depcruise` fail, then removing
it. A rule you have not seen fail is a rule you do not know you have.

## Acceptance criteria

- [ ] ⌘K opens the palette from both `/` and `/watchlist`; `Escape` closes it; ⌘K does not hijack
      focus while the user is typing in another text input.
- [ ] Typing searches assigned tickets, watchlist cards, and review cards simultaneously, on either
      board route. An exact Jira-key match ranks above a mid-summary substring hit.
- [ ] `↑`/`↓` and `j`/`k` move the selection; `Enter` opens the selected item's detail panel
      (the per-item action list arrives in slice 86).
- [ ] A ticket present in two sources appears **once**.
- [ ] `src/routes/-header/SearchInput.tsx` no longer exists; `Header.tsx` renders an active-filter
      chip in its place.
- [ ] "Filter board by '‹query›'" applies the typed text to the current board and closes;
      "Clear board filter" appears only while a filter is active and clears it.
- [ ] `contexts/command-palette/{domain,view-model}` import nothing outside `kernel` (+ `domain` for
      the view-model) — enforced by two new `error`-severity dependency-cruiser rules, and the
      `no-cross-context` rule has been observed to fail against a deliberate violation.
- [ ] The view-model has no React import; the presenter is the only React-bound module.
- [ ] Unit tests: `rank-items` (term matching, key-prefix ranking, empty query), `palette-key-intent`,
      and the view-model reducer + derive.
- [ ] `contexts/command-palette/CONTEXT.md` exists and states why there is no `application/` layer.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green; `pnpm check:arch` no
      worse than master (advisory — do not chase).
- [ ] e2e: a spec covering open → type → navigate → open detail, and one covering filter-then-clear.

## Blocked by

84.
