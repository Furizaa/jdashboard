# 69 — ADF inlineCard rendering

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

Pure client-side slice. Adds `inlineCard` support to the Detail panel's ADF renderer with URL-shape-based dispatch, plus the `RenderAdf` prop rename and threading required to make Jira-issue cross-references render as `<KEY>` chips inside both the issue description and every comment body.

After this slice merges, an `inlineCard` ADF node whose URL matches `<jiraBaseUrl>/browse/<KEY>` renders as a Jira-blue chip showing `<KEY>`; every other URL renders as a muted globe-icon chip showing `host + path`. Both chips open in a new tab on click. The `[unsupported: inlineCard]` placeholder no longer appears.

Concretely:

- **New domain function** `src/contexts/detail/domain/parse-inline-card.ts`:
  - Public `parseInlineCard(url: string, jiraBaseUrl: string | null): InlineCardKind`.
  - `InlineCardKind = { _tag: 'JiraIssue'; issueKey: string; url: string } | { _tag: 'PlainUrl'; url: string; display: string }`.
  - Detects Jira issue URLs by matching `<jiraBaseUrl>/browse/<KEY>` (case-insensitive host, exact path prefix). Returns `JiraIssue` with the extracted key.
  - All other URLs return `PlainUrl` with `display = host + path` after stripping `https://` and trailing slashes; truncates the display to ≤ 40 characters with a tail ellipsis.
  - URL parsing failure returns `PlainUrl` with the raw input as display. Null/empty `jiraBaseUrl` falls through to `PlainUrl` for everything.
- **New domain test** `parse-inline-card.test.ts` — table-driven over the cases above (matching base URL with browse path, matching base URL non-browse, non-Jira host, null base, malformed URL, trailing-slash and `https://` stripping, truncation).
- **`RenderAdf` prop rename**: `jiraUrl` → `jiraBaseUrl` (the host root, not the issue's URL).
  - Updated signature: `RenderAdf({ doc, jiraBaseUrl }: { doc: AdfNode | null; jiraBaseUrl?: string })`.
  - The existing "Media hosted in Jira" placeholder link in `Media.tsx` continues to work; the prop carries the same value (host root rather than full issue URL is correct here too).
  - Update `RenderAdf.test.tsx` snapshots / inline assertions to match.
- **Thread `jiraBaseUrl` through both call sites**:
  - `view/PanelBody.tsx` — already receives `jiraUrl` as a prop; rename and recompute as the host root from `LoadIssueOk.baseUrl` (or strip `/browse/<key>` from the existing prop value).
  - `view/Activity.tsx` — currently calls `<RenderAdf doc={comment.body} />` with no URL prop. Add the `jiraBaseUrl` prop and pass it from `IssueDetailPanel` → `Activity`.
- **New ADF node component** `view/adf/nodes/InlineCard.tsx`:
  - Accepts the URL string and `jiraBaseUrl`.
  - Calls `parseInlineCard`; exhaustively matches the union via `ts-pattern.exhaustive()`.
  - `JiraIssue` branch renders `<JiraIssueChip issueKey={...} url={...} />` — chip styled with subtle Jira-blue accent (e.g. `bg-sky-500/15 text-sky-200`), monospace key text, opens in new tab on click.
  - `PlainUrl` branch renders `<PlainUrlChip url={...} display={...} />` — muted chip with a globe lucide icon, opens in new tab on click.
  - Both chips render as inline `<a>` elements with `target="_blank" rel="noopener noreferrer"`.
- **Wire into `RenderAdf`**:
  - Add an `.with({ type: 'inlineCard' }, ...)` branch in the `match()` ladder in `RenderAdf.tsx`.
  - Pass `jiraBaseUrl` down to `InlineCard` (the renderer already threads `jiraUrl` to `Media`; threading `jiraBaseUrl` continues that pattern).
- **Update `RenderAdf.test.tsx`** with new cases:
  - `inlineCard` whose URL is `<jiraBaseUrl>/browse/HDR-123` renders as a chip containing `HDR-123`.
  - `inlineCard` whose URL is non-Jira renders as a chip containing the truncated host + path.
  - `inlineCard` rendered without `jiraBaseUrl` falls through to `PlainUrl`.
- **Extend the existing E2E** `tests/e2e/ticket-detail/adf-rendering.spec.ts`:
  - Add an `inlineCard` node to the description fixture: one Jira issue URL, one non-Jira URL.
  - Assert the Jira-issue chip is visible with the expected key text.
  - Assert the plain-URL chip is visible with the expected truncated display.
  - Assert both have the right `target` and `rel` attributes.

## Acceptance criteria

- [ ] `src/contexts/detail/domain/parse-inline-card.ts` exists with `parseInlineCard` exported and the `InlineCardKind` discriminated union typed.
- [ ] `parse-inline-card.test.ts` covers: matching base URL with `/browse/<KEY>` returns `JiraIssue`; matching base URL non-browse path returns `PlainUrl`; non-Jira host returns `PlainUrl`; null base URL returns `PlainUrl` for any input; malformed URL returns `PlainUrl` with raw input as display; `https://` and trailing slashes stripped; display truncated to ≤ 40 chars with ellipsis.
- [ ] `RenderAdf`'s `jiraUrl` prop is renamed to `jiraBaseUrl`. Both call sites (`PanelBody`, `Activity`) pass it. The rename does not regress the "Media hosted in Jira" placeholder link.
- [ ] `view/adf/nodes/InlineCard.tsx` exports an `InlineCard` component that exhaustively matches `InlineCardKind` and renders `JiraIssueChip` or `PlainUrlChip`.
- [ ] `RenderAdf.tsx` dispatches `inlineCard` ADF nodes through `InlineCard`. The `[unsupported: inlineCard]` placeholder no longer appears for `inlineCard` nodes.
- [ ] `RenderAdf.test.tsx` covers the three new inline-card cases (Jira issue, plain URL, missing base URL).
- [ ] `tests/e2e/ticket-detail/adf-rendering.spec.ts` is extended with two `inlineCard` cases (Jira and non-Jira).
- [ ] `JiraIssueChip` and `PlainUrlChip` render as inline `<a target="_blank" rel="noopener noreferrer">` elements.
- [ ] No imports from `react`, `@tanstack/react-*`, `sonner`, `window`, or `document` in `parse-inline-card.ts` (verified by `dependency-cruiser`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately.
