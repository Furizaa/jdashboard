# Mock at the network boundary for the e2e harness

The e2e harness exists to give the upcoming architectural refactor — which will reshape both source modules and their unit tests — an externally-anchored safety net. We mock at the **HTTP network boundary** (intercepting outbound requests to Atlassian and GitLab) rather than at any internal seam (server functions, gateways, query hooks). The Atlassian/GitLab API contracts are stable and outside our codebase, so the mock seam survives any internal reshuffling. Internal seams will move with the refactor and would break the harness alongside the unit tests it is meant to outlive.

## Considered Options

- **Mock at the server-function level.** Replace the TanStack Start server functions with test doubles. *Rejected:* skips the entire server pipeline — error mapping, JQL building, bulk-fetch composition — which is exactly the composition layer the refactor will reshape and the harness must protect.
- **Mock at the gateway level (`server/jira/http-gateway.ts`, `server/gitlab/http-gateway.ts`).** Inject fake gateways in test mode. *Rejected:* tied to the gateway files surviving the refactor recognisably. The PRDs explicitly contemplate restructuring these modules.
- **Use Playwright's `page.route()` for HTTP interception.** *Rejected:* `page.route` only intercepts requests the *browser* makes, but Jira/GitLab calls are made by the *server* (the API token never reaches the browser, by design). `page.route` cannot see them.
- **Mock at the network boundary with an MSW Node sidecar.** *Selected.* The app boots with `JIRA_BASE_URL` / GitLab base URL pointed at a local MSW server. The whole stack — server functions, gateways, query hooks, components — runs unmodified. The seam is the Atlassian/GitLab HTTP contract, which the refactor cannot move.

## Consequences

- The harness has no awareness of internal module shape. A refactor that splits, merges, or renames any module under `src/` does not require test changes (modulo selector/testid renames, which are mechanical).
- HTTP error mapping (401 → toast / full-screen, 5xx → banner) is exercised end-to-end rather than stubbed.
- Fixture authoring lives at the Atlassian/GitLab JSON shape, not at our internal type shape. Handcrafted factories (`makeIssue`, `makeMr`, …) keep this tractable and free of internal/confidential ticket content.
- The harness does not catch real-API contract drift (Atlassian/GitLab changing their schema). That remains the manual-verification layer's job, accepted as a deliberate trade for refactor stability.
