# 78 — Effect server: polymorphic `notImpl<A, E>` in fake gateways

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Drop the `as JiraGatewayShape` / `as GitlabGatewayShape` cast at the bottom of every fake-gateway helper by making `notImpl` polymorphic in its A and E type parameters. TypeScript will then infer the right per-method `Effect<A, E>` slot at every placeholder call site without the trailing cast.

Concretely:

- In each `__fixtures__/fake-*-gateway.ts` file, change `notImpl` from:
  ```ts
  const notImpl = (label: string) =>
    Effect.die(new Error(`fake-jira-gateway: ${label} not implemented in this test`))
  ```
  to:
  ```ts
  const notImpl = <A, E>(label: string): Effect.Effect<A, E> =>
    Effect.die(new Error(`fake-jira-gateway: ${label} not implemented in this test`))
  ```
  (and the analogous `fake-gitlab-gateway` text).
- Drop the `as JiraGatewayShape` / `as GitlabGatewayShape` cast at the end of the returned object literal. The object's inferred type now matches the gateway shape exactly.
- Apply to all six fixture files:
  - `contexts/board/application/__fixtures__/fake-jira-gateway.ts`
  - `contexts/board/application/__fixtures__/fake-gitlab-gateway.ts`
  - `contexts/detail/application/__fixtures__/fake-jira-gateway.ts`
  - `contexts/capture/application/__fixtures__/fake-jira-gateway.ts`
  - `contexts/review/application/__fixtures__/fake-jira-gateway.ts`
  - `contexts/review/application/__fixtures__/fake-gitlab-gateway.ts`

No production code changes; no test rewrites — every existing application-service test should keep passing untouched.

## Acceptance criteria

- [ ] All six `__fixtures__/fake-*-gateway.ts` files use the polymorphic `notImpl<A, E>` signature.
- [ ] No remaining `as JiraGatewayShape` / `as GitlabGatewayShape` cast in the fake-gateway files.
- [ ] All existing application-service tests pass unchanged.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green.

## Blocked by

None — can start immediately.
