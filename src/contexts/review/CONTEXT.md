# Review

Owns the cross-cutting GitLab merge-request review queue and the cache hook that subscribes to it. The server already builds `ReviewCard`s (`src/server/gitlab/review-service.ts`); this context owns the **client-side** loading + cache lifecycle and exposes the cards via a presenter hook so Board can render them.

Review has **no top-level view**. Its visible surfaces are cards rendered by the Board context (and the per-card MR section rendered by the `~/widgets/mr-section` compound API). The pure projection helpers (`reviewCardId`, `reviewBucketColumn`, `reviewSearchHaystack`, `REVIEW_BUCKET_STATUS_NAME`) live in `~/kernel/review` because they are cross-context primitives consumed by Board's `assembleColumns` — review owns the loading lifecycle, the kernel owns the projection vocabulary.

## Language

**ReviewCard** (kernel re-export):
The unit of the review queue — a `review-real | review-fake` discriminated union built server-side from a GitLab MR plus its associated Jira ticket (if resolvable). Carries `bucket`, `mrState`, `reviewers`, `unresolvedCount`, `ciState`, etc.

**Bucket**:
The reviewer-relative outcome of an MR — `needs-review | rejected | accepted`. Drives column placement (`accepted → Done`, otherwise `TO DO`) and pill text (`Needs Review`, `Review Rejected`, `Review Accepted`).

**Projection**:
The pure mapping `ReviewCard → ColumnItem<review>`-shaped data: column placement, stable id (`review:<iid>`), search haystack, and bucket-to-status-name. Lives in `~/kernel/review.ts` (cross-context primitive, not owned by this context). Consumed by Board's `assembleColumns`.

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

Review has **no view-model**. Its visible surfaces are cards on the Board grid; the Board context owns the loading / error / ready phases through its own view-model. Review's contribution is a cache hook (presenter); the projection vocabulary lives in `~/kernel/review`.

If a future change introduces a Review-only surface (e.g. a standalone "review queue" sidebar), this section would describe its state machine.

## Cross-context dependencies

- `~/kernel` — `Column`, `ReviewCard`, `ReviewCardReal`, `GetReviewCardsResult` and the projection helpers (`reviewCardId`, `reviewBucketColumn`, `reviewSearchHaystack`, `REVIEW_BUCKET_STATUS_NAME`).
- `~/coordinator` — `useBoardData`, `useCoordinator`, `DASHBOARD_QUERY_KEYS`, `DASHBOARD_STALE_TIMES` (presenter only).
- `~/server/gitlab` — `getReviewCards` server function (presenter only).
- `~/lib/use-polling` — visibility-aware refetch interval (presenter only).

No imports from `~/contexts/<other>`. The cache hook is consumed by Board through the coordinator's re-export (`useReviewCards` from `~/coordinator`); the projection helpers are consumed directly from `~/kernel`. There is no cross-context edge.

## Public surface

Review has **no top-level view**, so the barrel exports only the cache hook (the projection helpers live in `~/kernel/review` and are imported from there directly):

```ts
export { useReviewCards } from './presenter'
```

Internal types (`ReviewApplicationService`, `ReviewSnapshot`, `ReviewLoadError`, …) are not part of the public surface and are not re-exported.
