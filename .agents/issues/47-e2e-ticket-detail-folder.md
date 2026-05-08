# 47 — E2e: ticket-detail folder specs

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Five scenario specs covering the ticket-detail feature folder. The largest slice in the suite — it covers the panel's URL plumbing, navigation, ADF rendering, cross-JQL fetches, and keyboard shortcuts.

- Extend `World` with detail-specific shape:
  - `seedIssueDetail(key, { description, comments, parent, subtasks, issuelinks })` — extends the issue's stored shape with the fields the detail panel reads.
  - `searchIssues({ keys })` overload (already present from board JQL, generalise to also serve `key in (...)` lookups for sub-issues / linked issues that fall outside the board JQL).
  - Implementation note: sub-issues and linked-issues fetches are *separate* GETs in the codebase; handlers should serve them from the same World.
- Extend MSW handlers: `GET /issue/:key` (with `expand=...` query handling — return the same World object regardless of `expand`), and whatever cross-JQL endpoint the codebase uses to load sub-issues / linked issues.

Specs:

- `tests/e2e/ticket-detail/panel-open-close.spec.ts` — open panel via card click, assert URL contains `?issue=<KEY>`; close via Esc, assert URL no longer has the param; reopen; close via browser back; reopen; close via the panel close button. Asserts URL state on every transition.
- `tests/e2e/ticket-detail/navigation.spec.ts` — seed three issues in one column; open panel for the middle one; press `J` and `↓` to step forward, assert the URL key updates; press `K` and `↑` to step back; click the panel header's prev/next arrows, assert the same.
- `tests/e2e/ticket-detail/linked-issues.spec.ts` — seed an issue with sub-issues and linked issues whose keys are *outside* the board JQL filter (e.g. linked issues from a different label or project); assert sub-issues and linked-issues sections render with the correct `n done / m total` chip; click a linked-issue row, assert the panel navigates to that key (URL updates, body re-renders); the "fall outside board JQL" path must work — that's the value of this spec.
- `tests/e2e/ticket-detail/adf-rendering.spec.ts` — seed an issue whose ADF description includes one of each supported node (paragraph, heading, bulletList, orderedList, codeBlock, blockquote, hardBreak, rule, mention, emoji, mediaSingle, status, panel, text with `strong`/`em`/`code`/`link`/`strike` marks); assert each node renders with its expected role/text. Seed a description containing an *unsupported* node type; assert the `[unsupported: <type>]` placeholder renders. Single spec, multiple assertions; this is the bulk content covered.
- `tests/e2e/ticket-detail/keyboard-shortcuts.spec.ts` — open panel; press `O`, assert a new tab opens to the Jira URL; press `C`, assert the clipboard contains the Jira URL and a "Copied" indicator appears.
- Extend `src/lib/testids.ts` only as needed: `detailPanel`, `subIssueRow`, `linkedIssueRow`. Roles preferred where they suffice (panel is `role="dialog"`; rows can be `role="link"` or `role="button"` depending on how the panel renders them).
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] All five specs pass on a clean checkout.
- [ ] Panel-open-close spec asserts the URL on every transition (open/close/reopen), not just the final state.
- [ ] Navigation spec exercises both keyboard (`J`/`K`/arrows) and click-on-arrow paths and asserts URL updates each time.
- [ ] Linked-issues spec proves the cross-JQL fetch happened by inspecting MSW request logs (a `key in (...)` request for a key not in the board's JQL filter must appear).
- [ ] ADF spec covers every supported node type listed in the parent PRD plus the unsupported-fallback path.
- [ ] Keyboard spec uses `O` and `C` only when the panel is open and asserts they have *no* effect when the panel is closed (negative case).
- [ ] No structural CSS selectors. Testids added centrally.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 43 — E2e tracer bullet
