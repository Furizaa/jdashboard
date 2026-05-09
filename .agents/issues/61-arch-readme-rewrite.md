# 61 — Architecture: README rewrite (architecture-first)

**Type:** HITL

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

Rewrite the project README so its headline is the team-template angle: clashboard *is* a reference implementation of clean architecture for a React/TypeScript frontend. Product context (what clashboard does) becomes a "what this app is" section near the top; the bulk of the README points at the architecture documentation.

After this slice merges, a teammate clicking through the repo on its main page sees the architecture as the primary frame; the existing PRDs are linked as reference material for "what the app actually does."

Why HITL: the README sets the project's external-facing tone. The voice ("a reference implementation we use as the canonical example..."), the call-outs (which decisions are highlighted upfront vs. linked), and the "how to read this codebase" section are authorial; review is the place to land them.

Concretely, the README structure:

1. **Title and one-line summary** — "clashboard — a clean-architecture reference implementation for React + TypeScript, in the form of a personal Jira/GitLab dashboard."
2. **What this codebase shows** (~150 words) — the four big claims: bounded contexts as the organising axis; framework-free view-models with thin React presenters; tagged-error result types matched with ts-pattern (neverthrow on client, Effect on server); architectural rules enforced as CI gates. One sentence per claim, each linking to the relevant ADR.
3. **What this app is** (~80 words) — the product summary, kept short. Links to `.agents/prds/clashboard.md` and the other PRDs as reference material.
4. **How to read this codebase** — the manga's reading order:
   1. Start with `CONTEXT-MAP.md` (the architectural overview)
   2. Read `docs/tour.md` (one user action through every layer)
   3. Reference `docs/layers.md` (one example per layer)
   4. Per-context details in `contexts/<name>/CONTEXT.md`
   5. Decision records in `docs/adr/`
5. **Folder layout** — a tree showing `src/{kernel, contexts, widgets, coordinator, design-system, routes, lib, server}/` with one-line descriptions.
6. **Architecture diagram** — embedded `docs/architecture.svg` with a one-sentence caption.
7. **Quick start** — install, dev, test, e2e (existing content; reorganized if needed).
8. **Governance** — the four-tool kit (oxlint, dep-cruise, fallow, ts-pattern.exhaustive), the three CI gates, and how to run each locally.
9. **The team-template angle** — explicit: "we use this codebase as the canonical example of clean architecture for our team's TypeScript frontend projects." A short call-out that other team projects should mirror the layer vocabulary, the dependency law, and the test approach per layer.
10. **Status** — that this is a *reference implementation*, the architecture is enforced by CI, and changes to the architecture require a new ADR.

The README is ~1000–1500 words. It does not duplicate `CONTEXT-MAP.md` or the ADRs — it points at them.

## Acceptance criteria

- [ ] `README.md` is rewritten following the structure above.
- [ ] Document length is between ~1000 and ~1500 words.
- [ ] All ten sections (title/summary; what-this-codebase-shows; what-this-app-is; how-to-read; folder-layout; diagram; quick-start; governance; team-template-angle; status) are present.
- [ ] `docs/architecture.svg` is embedded with a one-sentence caption.
- [ ] All cross-document links are valid: `CONTEXT-MAP.md`, `docs/tour.md`, `docs/layers.md`, every ADR (0001–0004), every per-context `CONTEXT.md`, every PRD in `.agents/prds/`.
- [ ] The "what this codebase shows" section links each of the four big claims to its ADR.
- [ ] The product summary (~80 words) is honest about what clashboard *does* without burying the architecture-first frame.
- [ ] `pnpm format:check` passes.
- [ ] Markdown links are valid.
- [ ] Reviewer confirms the README reads architecture-first — i.e. the team-template angle is the project's headline; product context is referenced, not detailed.

## Blocked by

- 59 — Architecture: tour doc
- 60 — Architecture: layers reference doc
