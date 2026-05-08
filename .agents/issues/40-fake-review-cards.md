# 40 — Card view-model + fake cards for MRs without resolvable Jira keys

**Type:** AFK

## Parent

[GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md)

## What to build

Two related changes: a new pure view-model module that absorbs all card-source-aware logic upstream of the React component, and the fake-card path for review MRs whose title contains no Jira project key (or a key that the bulk Jira fetch could not resolve).

- New pure module `src/features/ticket-card/build-card-view.ts`:
  - Public type `TicketCardViewModel` with the unified slot shape consumed by `TicketCard`:
    - `keyDisplay: string` — `HDR-NNNN` for Jira and real review cards; `MR !<iid>` for fake cards.
    - `keyClick: { kind: 'copy-jira'; url: string } | { kind: 'open-mr'; url: string }` — Jira and real review cards copy Jira URL; fake cards open MR.
    - `keyOpenInJira: string | null` — destination for Cmd/Ctrl-click; `null` for fake cards.
    - `typeIcon: { kind: 'jira'; type: string } | { kind: 'merge-request' }` — `merge-request` only for fake cards.
    - `summary: string` — Jira summary for Jira/real review cards; MR title for fake cards.
    - `labels: readonly string[]` — empty for fake cards.
    - `epic: { key: string; summary: string } | null` — `null` for fake cards.
    - `pill: { text: string; clickable: boolean }` — Jira status (clickable) for Jira-work cards; review-state name (non-clickable) for review cards (real or fake).
    - `bodyClick: { kind: 'open-panel'; issueKey: string } | { kind: 'open-mr'; url: string }` — fake cards use `open-mr`.
    - `mrSection: { mode: 'jira'; column: Column; issueKey: string } | { mode: 'review'; reviewers: …; ciState: …; unresolvedCount: …; mrState: 'opened' | 'merged' } | null` — review-mode shape carries the data needed by `MrSection` directly so it does not need to do its own lookup for review cards.
    - `deemphasized: boolean`.
    - `fixasap: boolean` (preserve the existing FIXASAP behaviour for Jira and real review cards; fake cards always `false`).
  - Public function `buildCardView(input)` taking either `{ kind: 'jira'; issue: BoardIssue; column: Column; baseUrl: string }` or `{ kind: 'review'; card: ReviewCard; column: Column; baseUrl: string }` and emitting the view-model.
  - All slot decisions live here (key text, click target, type icon kind, fake fallback). No React.
- Extend `ReviewCard` in `src/server/gitlab/review-service.ts`:
  - Discriminated union: `{ kind: 'review-real'; jira: { key, summary, typeName, labels, epic } } | { kind: 'review-fake'; jiraKeyAttempted: string | null }`. Both kinds carry the shared MR fields (`iid`, `webUrl`, `title`, bucket, mrState, reviewer states, ciState, unresolvedCount).
  - The existing pipeline composes `kind: 'review-real'` when the Jira bulk fetch returned the key in `found`, and `kind: 'review-fake'` otherwise. `jiraKeyAttempted` records the first key from the title (if any) so debugging surfaces have something to grep.
  - The mr-key-extraction logic (currently inside `mr-key-map.ts` for author-mode) is reused — extract the regex matcher into a shared pure helper if not already shared.
- Refactor `src/features/ticket-card/TicketCard.tsx`:
  - Accept a `TicketCardViewModel` directly. The component becomes a presentational shell with no source-aware branching: every slot reads from the view-model.
  - The existing private sub-components (`CardKey`, `EpicChip`) stay private; their props change to consume the relevant view-model fields.
  - Pill rendering uses the view-model's `pill.clickable` flag to choose between the existing interactive `StatusPillSelect` and an inert `StatusPill` variant.
  - Body click dispatches based on `bodyClick.kind`: `open-panel` navigates with `?issue=<KEY>`; `open-mr` opens `url` in a new tab.
  - Key click dispatches based on `keyClick.kind`: `copy-jira` is the existing clipboard-copy + `Copied` indicator + Cmd/Ctrl-click-opens-Jira behaviour; `open-mr` opens the MR in a new tab unconditionally (no Cmd-click branch).
- Extend the type-icon system to support the `merge-request` kind:
  - Add a small case in `src/features/ticket-card/TypeIcon.tsx` that renders the lucide `GitMerge` icon when the view-model's `typeIcon.kind === 'merge-request'`. Otherwise existing Jira-type icon resolution is unchanged.
- Extend `MrSection` to accept the view-model's `mrSection` input directly (so it does not need to call `useMrFor` for review-mode cards). Author-mode behaviour is unchanged: when the view-model says `mode: 'jira'`, the section still uses `useMrFor(issueKey)`.
- Update the Board's call sites:
  - `src/features/board/Board.tsx` (or its `assemble-columns` consumer) calls `buildCardView` per item before handing it to `TicketCard`.
  - Both Jira-work cards and review-mode cards (real and fake) flow through the same path.
- Tests (Vitest):
  - `build-card-view.test.ts`:
    - Jira `BoardIssue` input: every slot is set as the existing TicketCard rendered today (regression).
    - `kind: 'review-real'` input: pill text equals review-state name, `pill.clickable === false`, type icon is the embedded Jira type, key = embedded Jira key, body click opens detail panel.
    - `kind: 'review-fake'` input: key = `MR !<iid>`, type icon kind = `merge-request`, summary = MR title, labels empty, epic null, body click opens MR.
    - Deemphasis flag respects the (lane, status) lookup from slice 39.
    - FIXASAP flag is set for Jira and real review cards when the label is present; never set for fake cards.
  - `review-service.test.ts` — extend with cases asserting that:
    - An MR title with no project key in title → `kind: 'review-fake'`, `jiraKeyAttempted: null`.
    - An MR title with a key not returned by the bulk fetch → `kind: 'review-fake'`, `jiraKeyAttempted: '<KEY>'`.
    - An MR title with multiple keys uses the first match for the bulk lookup; the others are ignored. If the first resolves → `kind: 'review-real'`; if not → `kind: 'review-fake'`.
- Composition layers (TicketCard view-model wiring, MrSection input shape, type-icon `merge-request` branch) are manually verified per the PRD's testing decisions.

## Acceptance criteria

- [ ] An MR I am assigned as a reviewer for, whose title contains no Jira project key matching the regex, surfaces as a fake card on the board.
- [ ] An MR whose title contains a Jira project key that the bulk Jira fetch did not resolve (deleted, cross-project, permission-denied) surfaces as a fake card on the board.
- [ ] A fake card displays its key as `MR !<iid>` (matching GitLab's `!` reference convention).
- [ ] A fake card uses the lucide `GitMerge` icon in place of the Jira type icon.
- [ ] A fake card uses the MR title (verbatim) as its summary, with the same 2-line clamp Jira cards use.
- [ ] A fake card renders no labels row and no epic chip.
- [ ] A fake card otherwise shares the chrome of real cards: identical card border/background, identical review-state pill (Needs Review / Rejected / Accepted), identical `MrSection` (avatars + CI when open, silence when merged).
- [ ] Body click on a fake card opens the MR in a new tab (not the detail panel — fake cards have no Jira detail to render).
- [ ] Key click on a fake card opens the MR in a new tab. There is no Cmd/Ctrl-click branch (fake cards have no Jira URL).
- [ ] An MR title with multiple Jira keys produces exactly one card. The first matched key is used for display and Jira lookup; other keys are ignored for the card.
- [ ] An MR whose first key resolves and whose subsequent keys are ignored does NOT fall through to fake-card rendering — it remains a real card backed by the first key's Jira metadata.
- [ ] `TicketCard` no longer branches on the source of the card data; all source-aware logic lives in `build-card-view`.
- [ ] `build-card-view.ts` is unit-tested per the PRD's testing decisions.
- [ ] Existing Jira-work card behaviour is unchanged: pill text matches the Jira status (rendered through the display-name layer from slice 39), pill is clickable, body click opens the detail panel, key click copies the Jira URL with the `Copied` indicator, FIXASAP ribbon still renders on labelled tickets.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [38 — Review-mode cards end-to-end (spine)](./38-review-cards-spine.md)
- [39 — Review-state sort tiers + Review Rejected deemphasis + READY TO PICK rename](./39-review-state-tiers.md)
