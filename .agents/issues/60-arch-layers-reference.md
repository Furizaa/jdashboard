# 60 — Architecture: layers reference doc

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

`docs/layers.md` — a reference document with one annotated example per architectural layer, drawn from the migrated codebase. Where the tour doc (slice 59) traces *one action across all layers*, this doc presents *one example of each layer in isolation* so readers can answer "what does an application service look like?" by pointing at a single file.

The doc is reference-style, not narrative: a section per layer, each with the layer's name, a one-sentence definition (copied from `CONTEXT-MAP.md` for consistency), a code excerpt from the migrated codebase, and a numbered list of annotations on what to notice.

The seven layers covered (matching the layer vocabulary in `CONTEXT-MAP.md`):

1. **Domain** — example: `kernel/columns.ts` `columnForStatus` (or `contexts/board/domain/sort-column.ts`). Annotations: pure function, no I/O, table-driven test in sibling file, no kernel-external imports.
2. **Gateway** — example: `server/jira/gateway.ts` (the port interface) + `server/jira/http-gateway.ts` (the adapter). Annotations: port = TS interface; adapter = factory; result types are tagged unions; the port shape is what the application service knows.
3. **Application service** — example: `contexts/board/application/board-application.ts`. Annotations: factory taking `deps`; framework-free; returns `ResultAsync<T, E>`; tested via hand-rolled fake gateway in `__fixtures__/`.
4. **View-model** — example: `widgets/status-pill/view-model/status-pill-select-view-model.ts` or `contexts/detail/view-model/issue-panel-view-model.ts`. Annotations: zero React imports; reducer + derivation; ts-pattern `.exhaustive()` everywhere; tests are table-driven without `renderHook`.
5. **Presenter** — example: `widgets/status-pill/presenter/use-status-pill-select.ts`. Annotations: thin React shell; the only place TanStack Query / Router / DOM listeners appear for this surface; feeds query data into view-model derivation.
6. **View** — example: `widgets/status-pill/view/StatusPillSelect.tsx`. Annotations: composition; no logic beyond rendering; imports presenter + design-system primitives only.
7. **Coordinator** — example: `coordinator/coordinator.ts` `applyTransition`. Annotations: cross-context orchestration; depends on context application services + ports; framework-free factory; tested via hand-rolled fakes.

The doc is shorter than the tour doc — ~800–1500 words. Each layer's code excerpt is 10–25 lines. The reading mode is "look something up," not "read end-to-end."

A closing section lists *anti-patterns* — what each layer must NOT do — and links to the dependency-cruiser rule that enforces each prohibition.

## Acceptance criteria

- [ ] `docs/layers.md` exists and is committed.
- [ ] Document length is between ~800 and ~1500 words.
- [ ] Seven layer sections present (Domain, Gateway, Application service, View-model, Presenter, View, Coordinator), each with: one-sentence definition, a code excerpt of 10–25 lines with a relative repo path, a numbered list of "what to notice" annotations.
- [ ] All code excerpts reflect the post-lockdown state of the codebase (slice 58) and resolve to real files.
- [ ] Closing "anti-patterns" section lists, for each layer, what it must NOT do, with a pointer to the corresponding `dependency-cruiser` rule by name.
- [ ] `pnpm format:check` passes against the doc.
- [ ] Markdown links are valid.

## Blocked by

- 58 — Architecture: lockdown
