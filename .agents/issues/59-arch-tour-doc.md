# 59 — Architecture: tour doc (the manga's first chapter)

**Type:** HITL

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

`docs/tour.md` — a single guided trace of one user action through every layer of the migrated codebase, with code excerpts. This is the manga's first chapter: a reader who finishes the tour understands how clashboard's architecture works and can navigate the codebase confidently.

The chosen action is **"user clicks the status pill on a card → optimistic transition lands → server confirms → cache invalidates"**. This trace exercises:

1. The view (StatusPillSelect's button)
2. The presenter (`use-status-pill-select`) wiring the click
3. The view-model (`status-pill-select-view-model`) holding open/closed + transitions phase
4. The widget's coordinator-action call (`coordinator.applyTransition(...)`)
5. The coordinator orchestrating two contexts:
   - Board's application service patches its cache (optimistic)
   - Detail's application service patches its cache (optimistic)
   - The Jira gateway port called via the TanStack Start server function
6. The server-side gateway adapter calling Jira's HTTP API and mapping errors to tagged unions
7. Result back through the coordinator: success → invalidate; failure → rollback both contexts + toast
8. Each context's presenter re-derives its view-model's `DisplayState`
9. Re-render

The doc is structured as nine numbered sections, one per layer, each with: a one-paragraph "what this layer does for this action," a code excerpt from the migrated codebase (real file path, real lines), and a "what to notice" bullet list highlighting the architectural invariant the reader should walk away with (e.g. "the view-model has no React import — that's the framework-decoupling claim made concrete").

Why HITL: the tour doc carries the manga's pedagogical weight. The narrative voice, the choice of which excerpts to surface, and the calibration of "what to notice" callouts are authorial. Review needs to land both technical accuracy *and* pedagogical clarity before merge.

Concretely:

- **Section 1: The click.** `widgets/status-pill/view/StatusPillSelect.tsx` — the button. What to notice: pure presentational; `onSelect` is a prop, not coupled to TanStack Query.
- **Section 2: The presenter.** `widgets/status-pill/presenter/use-status-pill-select.ts` — wires the click to coordinator action. What to notice: this is the only file in this trace that imports `@tanstack/react-query` — every layer below is framework-free.
- **Section 3: The view-model.** `widgets/status-pill/view-model/status-pill-select-view-model.ts` — what notice: `import` line shows zero React; reducer is `match(event).with(...).exhaustive()`.
- **Section 4: Coordinator entry.** `coordinator/coordinator.ts` `applyTransition`. What to notice: the function takes `Result<T, E>` and orchestrates two contexts via their application-service-injected ports. No view, no React.
- **Section 5: Optimistic patches.** Each context's application service `patchCache` — Board and Detail both. What to notice: per-context cache abstractions; the coordinator owns the cross-context choreography but doesn't know how each cache is implemented.
- **Section 6: The gateway call.** `server/jira/server-functions.ts` and the gateway adapter's `transitionIssue`. What to notice: this is the network boundary; failures are JSON-tagged errors, not Effect values; ts-pattern matches them on return.
- **Section 7: The result.** Coordinator unwraps `Result<T, E>` via ts-pattern; rollback or commit; toast via the `Toast` port.
- **Section 8: Re-derive.** Each context's presenter notices the cache change and the view-model re-derives its `DisplayState`. What to notice: the view receives a new `DisplayState` and re-renders; the round trip is over.
- **Section 9: The whole picture.** A reproduction of `docs/architecture.svg` with the action's path highlighted. What to notice: the path is a tree, not a graph; every edge it touches is one of the dependency-law's allowed edges.
- **Closing:** "What to read next" — pointers to `docs/layers.md`, ADRs 0002–0004, and the per-context `CONTEXT.md` files.

The doc is ~1500–2500 words; code excerpts are 5–15 lines each, never full files; every excerpt has a working hyperlink to the file in the repo (relative paths, github-style anchors).

## Acceptance criteria

- [ ] `docs/tour.md` exists and is committed.
- [ ] Document length is between ~1500 and ~2500 words.
- [ ] Nine sections present, each with: one-paragraph layer description, one code excerpt with a relative repo path, and a "what to notice" list highlighting an architectural invariant.
- [ ] All code excerpts are 5–15 lines and reflect the post-lockdown state of the codebase (slice 58).
- [ ] All file paths in the doc resolve to real files in the repo.
- [ ] An embedded reference to `docs/architecture.svg` (or a path-highlighted variant) closes the doc.
- [ ] A "what to read next" section closes the doc with links to `docs/layers.md`, ADRs 0002–0004, and per-context `CONTEXT.md` files.
- [ ] `pnpm format:check` passes against the doc.
- [ ] Markdown links are valid (no broken paths).
- [ ] Reviewer confirms the doc reads as the manga's first chapter — i.e. a competent React+TS engineer unfamiliar with clashboard could read it and understand the architecture from cold.

## Blocked by

- 58 — Architecture: lockdown
