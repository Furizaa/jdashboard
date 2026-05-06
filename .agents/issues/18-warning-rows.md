# 18 — Warning rows: draft, no-MR, no-reviewers

**Type:** AFK

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

Three of the four warning kinds for Code Review cards, sharing one component. None of these warnings transition the ticket — they either open the MR or are purely informational.

- New `src/features/mr-status/MrWarning.tsx`:
  - One amber row (`bg-amber-500/10`) with lucide `AlertTriangle` (12px), warning text, optional click handler on the row body, optional "View MR ↗" small link aligned to the right.
  - Same row height and rhythm as the reviewer row from slice 17 — visually identical "shape", different content.
- Extend `src/features/mr-status/MrSection.tsx` to handle three new branches for Code Review:
  - **No MR** — Code Review card whose `useMrStatus(key)` returns `null` *after* the MR data has resolved (distinguish from the loading state, which still shows the skeleton). Text: "No MR found". Informational only — no click handler, no "View MR" link.
  - **Draft MR** — summarizer `kind === 'draft'`. Text: "MR is draft". Body click opens the MR `web_url` in a new tab. No "View MR" link (the row body is the link).
  - **No reviewers** — summarizer `kind === 'no-reviewers'` (open, not draft, zero reviewers assigned). Text: "MR open, no reviewers assigned". Body click opens the MR `web_url` in a new tab.
- The `MrSummary` returned from the server function must include the MR `web_url` so the warnings can link to the right page. Adjust the `mr-status` summarizer accordingly.
- Verification is manual per the PRD — `MrWarning` is a presentation component, no unit tests required.

## Acceptance criteria

- [ ] Code Review card with a Code Review status but no matching MR (after MR data has loaded) shows the "No MR found" amber warning row. Clicking it does nothing (informational only).
- [ ] Code Review card whose MR is in draft shows the "MR is draft" amber warning row. Clicking the row opens the MR's `web_url` in a new tab.
- [ ] Code Review card whose MR is open + non-draft + has zero reviewers shows the "MR open, no reviewers assigned" amber warning row. Clicking the row opens the MR's `web_url` in a new tab.
- [ ] All three warnings share the same amber palette, icon, height, and visual rhythm as the reviewer row.
- [ ] The warning rows render only after MR data has loaded — they never replace the skeleton.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [17 — MR review row end-to-end](./17-mr-review-row.md)
