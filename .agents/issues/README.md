# clashboard issues

Tracer-bullet vertical slices derived from [the clashboard PRD](../prds/clashboard.md), [the GitLab MR status PRD](../prds/gitlab-mr-status.md), [the misc improvements PRD](../prds/misc-improvements.md), [the Quick Create PRD](../prds/quick-create.md), [the GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md), and [the e2e harness PRD](../prds/e2e-harness.md). Each slice cuts through all layers (server function → query hook → UI → tests where applicable) and is demoable on its own.

## Order & dependencies

```
01 → 02 → 03 ─┬─→ 04
              ├─→ 05 ─┬─→ 06 ─┬─→ 07
              │       │       └─→ 09
              │       └─→ 08
              │       └─→ 14
              └─→ 10
        02 ─┬─→ 11 ─→ 12
            ├─→ 13
            └─→ 15

16 → 17 ─┬─→ 18 ─┬─→ 19
         │       └─→ 20
         └─→ 21

22
23 → 24
25

26 ─┬─→ 27
    ├─→ 28
    ├─→ 29
    ├─→ 30
    ├─→ 31
    └─→ 32

38 ─┬─→ 39 ─→ 40
    ├─→ 41
    └─→ 42

43 ─┬─→ 44
    ├─→ 45
    ├─→ 46 ─→ 50
    ├─→ 47
    └─→ 48 ─→ 49
```

## Index

### clashboard core (PRD: [clashboard.md](../prds/clashboard.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 01 | [Scaffold + auth health check](./01-scaffold.md) | HITL | — |
| 02 | [Read-only board with status mapping](./02-board-statuses.md) | AFK | 01 |
| 03 | [Card visual polish](./03-card-polish.md) | AFK | 02 |
| 04 | [Click-to-copy + open-in-Jira from card](./04-card-actions.md) | AFK | 03 |
| 05 | [Detail panel (read-only, plain text)](./05-detail-panel.md) | AFK | 03 |
| 06 | [ADF renderer (core nodes)](./06-adf-core.md) | AFK | 05 |
| 07 | [Comments / activity feed](./07-activity.md) | AFK | 06 |
| 08 | [Parent, sub-issues, linked issues](./08-relationships.md) | AFK | 05 |
| 09 | [ADF renderer (extras)](./09-adf-extras.md) | AFK | 06 |
| 10 | [Status change mutation](./10-status-mutation.md) | AFK | 03 |
| 11 | [Polling + sync indicator + manual refresh](./11-polling.md) | AFK | 02 |
| 12 | [Change indication animations](./12-change-indication.md) | AFK | 11 |
| 13 | [Search filter](./13-search.md) | AFK | 02 |
| 14 | [Keyboard shortcuts (panel)](./14-keyboard.md) | AFK | 05 |
| 15 | [Loading / empty / transient-error states](./15-states.md) | AFK | 02 |

### GitLab MR status (PRD: [gitlab-mr-status.md](../prds/gitlab-mr-status.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 16 | [GitLab auth health check](./16-gitlab-auth.md) | HITL | — |
| 17 | [MR review row end-to-end](./17-mr-review-row.md) | AFK | 16 |
| 18 | [Warning rows: draft, no-MR, no-reviewers](./18-warning-rows.md) | AFK | 17 |
| 19 | [Merged warning + In STG transition](./19-merged-warning-transition.md) | AFK | 18 |
| 20 | [Done lane desync warning](./20-done-desync.md) | AFK | 18 |
| 21 | [Manual refresh integration + one-time GitLab 401 toast](./21-refresh-and-401.md) | AFK | 17 |

### Misc improvements (PRD: [misc-improvements.md](../prds/misc-improvements.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 22 | [Per-column sort + TO DO deemphasized tier](./22-column-sort-and-deemphasized.md) | AFK | — |
| 23 | [MR CI/conflict indicator on Code Review row](./23-mr-ci-conflict-indicator.md) | AFK | — |
| 24 | [MR block in detail panel + Open MR button](./24-mr-panel-block.md) | AFK | 23 |
| 25 | [FIXASAP corner ribbon](./25-fixasap-ribbon.md) | AFK | — |

### Quick Create (PRD: [quick-create.md](../prds/quick-create.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 26 | [Quick Create MVP (end-to-end)](./26-quick-create-mvp.md) | AFK | — |
| 27 | [Quick Create Type segmented control](./27-quick-create-type-segmented.md) | AFK | 26 |
| 28 | [Quick Create pinned `[FE]:` Summary prefix](./28-quick-create-summary-prefix.md) | AFK | 26 |
| 29 | [Quick Create dynamic in-progress epics in Parent dropdown](./29-quick-create-dynamic-epics.md) | AFK | 26 |
| 30 | [Quick Create in-flight spinner, 10s timeout, locked modal](./30-quick-create-spinner-timeout.md) | AFK | 26 |
| 31 | [Quick Create toast actions + parsed Jira error messages](./31-quick-create-toast-actions.md) | AFK | 26 |
| 32 | [Quick Create `c` keyboard shortcut](./32-quick-create-shortcut.md) | AFK | 26 |

### GitLab MR review cards (PRD: [gitlab-mr-review-cards.md](../prds/gitlab-mr-review-cards.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 38 | [Review-mode cards end-to-end (spine)](./38-review-cards-spine.md) | AFK | — |
| 39 | [Review-state sort tiers + Review Rejected deemphasis + READY TO PICK rename](./39-review-state-tiers.md) | AFK | 38 |
| 40 | [Card view-model + fake cards for MRs without resolvable Jira keys](./40-fake-review-cards.md) | AFK | 38, 39 |
| 41 | [Review-card change-indication animations](./41-review-card-change-indication.md) | AFK | 38 |
| 42 | [Detail panel "Open MR" extension to review-mode tickets](./42-panel-open-mr-review.md) | AFK | 38 |

### E2e harness (PRD: [e2e-harness.md](../prds/e2e-harness.md))

| # | File | Type | Blocked by |
|---|---|---|---|
| 43 | [E2e tracer bullet — Playwright + MSW + smoke spec](./43-e2e-tracer-bullet.md) | AFK | — |
| 44 | [E2e: board folder specs](./44-e2e-board-folder.md) | AFK | 43 |
| 45 | [E2e: ticket-card folder specs](./45-e2e-ticket-card-folder.md) | AFK | 43 |
| 46 | [E2e: status-pill folder specs (one-shot overrides + transitions)](./46-e2e-status-pill-folder.md) | AFK | 43 |
| 47 | [E2e: ticket-detail folder specs](./47-e2e-ticket-detail-folder.md) | AFK | 43 |
| 48 | [E2e: MR-status folder specs (GitLab World + factories)](./48-e2e-mr-status-folder.md) | AFK | 43 |
| 49 | [E2e: review-cards folder specs](./49-e2e-review-cards-folder.md) | AFK | 48 |
| 50 | [E2e: auth-status folder specs](./50-e2e-auth-status-folder.md) | AFK | 46 |
