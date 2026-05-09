# Review

Owns the cross-cutting GitLab merge-request review queue and projects each MR onto the Board grid as a "fake card" in the TO DO or Done column. The server already builds `ReviewCard`s (`src/server/gitlab/review-service.ts`); this context owns the **client-side** projection of those cards into board column items, plus the cache hook that subscribes to them.

Review has **no top-level view**. Its visible surfaces are cards rendered by the Board context (and the per-card MR section rendered by the `~/widgets/mr-section` compound API). Board's `assembleColumns` consumes Review's projection through the `~/contexts/review` barrel.

## Language

**ReviewCard** (kernel re-export):
The unit of the review queue — a `review-real | review-fake` discriminated union built server-side from a GitLab MR plus its associated Jira ticket (if resolvable). Carries `bucket`, `mrState`, `reviewers`, `unresolvedCount`, `ciState`, etc.

**Bucket**:
The reviewer-relative outcome of an MR — `needs-review | rejected | accepted`. Drives column placement (`accepted → Done`, otherwise `TO DO`) and pill text (`Needs Review`, `Review Rejected`, `Review Accepted`).

**Projection**:
The pure mapping `ReviewCard → ColumnItem<review>`-shaped data: column placement, stable id (`review:<iid>`), search haystack, and bucket-to-status-name. Lives in `domain/projection.ts`. Consumed by Board's `assembleColumns`.

**ReviewSnapshot**:
The data the application service exposes on success — `{ baseUrl, cards }`. Stripped of the `{ ok, reason }` envelope so the consumer sees a clean Result.

_Avoid_: "ReviewCardId" as a separate concept (it's `reviewCardId(card)` — a small pure helper); "review column" (the columns are kernel-level; review only places cards into them).

## Use-cases (application service surface)

The `ReviewApplicationService` wraps the `getReviewCards` server function with port-mediated cache invalidation. Cross-context concerns — the 401-toast on GitLab unauthorised, board-ready gating, polling — stay in the coordinator-adjacent `useReviewCards` hook (in `presenter/use-review-cards.ts`) and reuse the shared `Cache`/`Toast` adapters via `~/coordinator`.

| Method              | Returns                                        | Notes                                                                               |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `loadReviewCards()` | `ResultAsync<ReviewSnapshot, ReviewLoadError>` | Wraps the gateway. `ReviewLoadError` is `ReviewUnauthorized \| ReviewNetworkError`. |
| `refresh()`         | `void`                                         | Invalidates the review-cards cache via the cache port.                              |

`ReviewLoadError` is two hand-rolled tagged classes (`_tag: 'ReviewUnauthorized' \| 'ReviewNetworkError'`) per ADR 0004; the consumer unwraps via `result.match` or ts-pattern.

## View-model state machine

Review has **no view-model**. Its visible surfaces are cards on the Board grid; the Board context owns the loading / error / ready phases through its own view-model. Review's contribution is a pure projection (domain) and a cache hook (presenter).

If a future change introduces a Review-only surface (e.g. a standalone "review queue" sidebar), this section would describe its state machine.

## Cross-context dependencies

- `~/kernel` — `Column`, `ReviewCard`, `ReviewCardReal`, `GetReviewCardsResult`.
- `~/coordinator` — `useBoardData`, `useCoordinator`, `DASHBOARD_QUERY_KEYS`, `DASHBOARD_STALE_TIMES` (presenter only).
- `~/server/gitlab` — `getReviewCards` server function (presenter only).
- `~/lib/use-polling` — visibility-aware refetch interval (presenter only).

No imports from `~/contexts/<other>`. Review's outputs are imported by Board through `~/contexts/review`'s barrel — a graduated cross-context exception in `.dependency-cruiser.cjs` (see slice 58 lockdown for whether to fold the projection into `~/kernel/` and remove the edge entirely).

## Public surface

Review has **no top-level view**, so the barrel exports the projection helpers (consumed by Board's `assembleColumns`) and the cache hook (consumed by Board's presenter):

```ts
export {
  REVIEW_BUCKET_STATUS_NAME,
  REVIEW_CARD_ID_PREFIX,
  reviewBucketColumn,
  reviewCardId,
  reviewSearchHaystack,
} from './domain'
export { useReviewCards } from './presenter'
```

Internal types (`ReviewApplicationService`, `ReviewSnapshot`, `ReviewLoadError`, …) are not part of the public surface and are not re-exported.
