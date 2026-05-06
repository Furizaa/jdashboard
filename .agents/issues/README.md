# clashboard issues

Tracer-bullet vertical slices derived from [the PRD](../prds/clashboard.md). Each slice cuts through all layers (server function → query hook → UI → tests where applicable) and is demoable on its own.

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
```

## Index

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
