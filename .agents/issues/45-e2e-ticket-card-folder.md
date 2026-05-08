# 45 — E2e: ticket-card folder specs

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Three scenario specs covering the ticket-card feature folder.

- `tests/e2e/ticket-card/click-semantics.spec.ts` — seed an issue; click the card body, assert the detail panel opens with `?issue=<KEY>` in the URL; close panel; click the card key, assert the in-place "Copied" indicator and that the clipboard contains the Jira URL (use Playwright's clipboard permission grant); Cmd/Ctrl-click the key, assert a new tab is opened to the Jira URL (Playwright `context.waitForEvent('page')`).
- `tests/e2e/ticket-card/label-dots.spec.ts` — seed an issue with five labels including the configured `JIRA_LABEL_FILTER`; assert the filter label is hidden, the first three remaining labels render as dots, and a `+N` chip is present for the rest. Hover dot, assert the native `title` attribute contains the label string.
- `tests/e2e/ticket-card/change-pulse.spec.ts` — seed two issues; advance clock 60s with a mutation that changes one issue's status; assert the changed card has the pulse class applied, then advance clock past the 600ms pulse window and assert it's gone. (Animation durations are zeroed in test mode, but the state-change *class application* can still be asserted.) Add a new issue between polls; assert the entering class is applied. Remove an issue; assert the leaving class is applied.
- Extend `src/lib/testids.ts` and components only as needed: `labelDot`, `labelOverflowChip`, plus class-marker testids for `change-pulse`, `entering`, `leaving` (these are *state classes*, not interaction targets — the testid here is for the test assertion only).
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] All three specs pass on a clean checkout.
- [ ] Clipboard assertion uses Playwright's clipboard API, not a stub.
- [ ] Cmd/Ctrl-click test correctly opens a new tab and asserts its URL — no false positives on a same-tab navigation.
- [ ] Hidden-label rule is asserted against the configured `JIRA_LABEL_FILTER` env value, not a hardcoded literal.
- [ ] Change-pulse assertions inspect the *class* being applied/removed at the right moments, not the visual animation.
- [ ] No structural CSS selectors. Testids added centrally.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 43 — E2e tracer bullet
