# Capture

Owns the Quick Create modal: a four-field form that creates a Jira issue and toasts the result. Tracks the modal's open/close/pending/error lifecycle, parent selection (pinned + dynamic in-progress epics), the `[FE]:` summary affordance, type segmentation, and the global `c` keyboard shortcut.

## Language

**QuickCreateInput** (kernel re-export):
The validated form payload — `{ type, parentKey, summary, description }`. Schema lives in `~/server/contexts/capture/application/quick-create-schema` and is re-exported through `~/kernel`; the view-model and presenter receive it as a plain value.

**QuickCreate state**:
The view-model's discriminated union — `closed | open-idle | open-pending | open-error`. `open-error` carries the last failure message. `open-pending` blocks close events and hides the form (spinner shown).

**QuickCreate event**:
The view-model input — `opened | closed | formSubmitted | submitResolved | submitRejected | timedOut`. The reducer is exhaustive over event × state via ts-pattern.

**Pinned parent**:
A hard-coded epic (`HDR-3817`, `HDR-10519`, `HDR-11712`) shown above the dynamic list — owned by the domain layer (`hardcoded-parents`).

**Dynamic epic**:
A user's currently-in-progress epic, loaded by the gateway through `loadMyEpics`. Rendered below the pinned list when the modal is open.

_Avoid_: "isPending" as a separate concept (it's a derivation of `phase === 'open-pending'`); "open" as a boolean field on state (the field is `phase`; `open` is the selector `phase !== 'closed'`).

## Use-cases (application service surface)

The `CaptureApplicationService` handles validation + the gateway call. Cross-context orchestration (board cache invalidation, success/error toasts, the 10s submit timeout) stays in the coordinator's `createIssue` action.

| Method                  | Returns                                                    | Notes                                                                                                       |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `submit(input, signal)` | `ResultAsync<CaptureSubmitSnapshot, CaptureSubmitError>`   | Wraps the gateway. `CaptureSubmitError` is `CaptureUnauthorized \| CaptureRejected \| CaptureNetworkError`. |
| `loadEpics()`           | `ResultAsync<CaptureEpicsSnapshot, CaptureLoadEpicsError>` | Wraps the gateway. `CaptureLoadEpicsError` is `CaptureEpicsUnauthorized \| CaptureEpicsNetworkError`.       |

Errors are hand-rolled tagged classes (`_tag: 'CaptureUnauthorized' | …`) per ADR 0004; consumers unwrap via `result.match` or ts-pattern over the underlying tagged union.

## View-model state machine

`State` is the discriminated union `closed | open-idle | open-pending | open-error`; `Event` covers the six transitions. `reduce(state, event)` is exhaustive over the event union (ts-pattern `.exhaustive()`); within each arm the reduction over the current phase is itself exhaustive or otherwise-anchored.

Transition table:

| from / event     | opened    | closed      | formSubmitted | submitResolved | submitRejected | timedOut   |
| ---------------- | --------- | ----------- | ------------- | -------------- | -------------- | ---------- |
| **closed**       | open-idle | —           | —             | —              | —              | —          |
| **open-idle**    | —         | closed      | open-pending  | —              | —              | —          |
| **open-pending** | —         | — (blocked) | — (blocked)   | closed         | open-error     | open-error |
| **open-error**   | —         | closed      | open-pending  | —              | —              | —          |

`—` means the state machine returns the state unchanged. Closing while pending and double-submit while pending are both rejected by the reducer, not by guards in the presenter — the presenter just dispatches.

`isOpen(state)` returns `phase !== 'closed'`; `isPending(state)` returns `phase === 'open-pending'`. The presenter exposes both as plain booleans so the view doesn't have to reach into `phase`.

## Cross-context dependencies

- `~/kernel` — `QuickCreateInput`, `quickCreateSchema`, `EpicRef`, `CreateIssueResult`, `GetMyEpicsResult` (all re-exported from `~/server/contexts/capture` + `~/server/server-functions/capture`).
- `~/coordinator` — `useCreateAction` (presenter only); the cross-context `createIssue` action handles toasts, board cache invalidation, and the 10s timeout.
- `~/server/server-functions/capture` — `getMyEpics` server function (presenter only, called via `useMyEpics`).
- `~/widgets/ticket-card` — `TYPE_STYLES` (view layer only).

No imports from `~/contexts/<other>`. Cross-context coordination would go through the coordinator.

## Public surface

`src/contexts/capture/index.ts` exports only the route-facing surface:

```ts
export { QuickCreateButton } from './view'
```

`QuickCreateButton` is the trigger that mounts the modal. The Header (or eventual route shell) imports it from `~/contexts/capture` and drops it into its layout. Internal types (`QuickCreateApi`, `State`, `Event`, `CaptureApplicationService`, …) are not part of the public surface and are not re-exported.
