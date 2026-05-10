/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-context',
      comment:
        'a bounded context cannot import another bounded context — cross-context coordination belongs in coordinator/.',
      severity: 'error',
      from: {
        path: '^src/contexts/([^/]+)/',
      },
      to: {
        path: '^src/contexts/([^/]+)/',
        pathNot: '^src/contexts/$1/',
      },
    },
    {
      name: 'no-react-in-domain-application-view-model',
      comment:
        'domain, application, and view-model layers must stay framework-free — React, TanStack Query, TanStack Router, and sonner are presenter-only',
      severity: 'error',
      from: {
        path: '^src/contexts/[^/]+/(domain|application|view-model)/',
      },
      to: {
        path: '^(react|react-dom|@tanstack/react-query|@tanstack/react-router|sonner)($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'no-tanstack-query-outside-presenter',
      comment:
        'inside contexts/, @tanstack/react-query lives only in presenter/ — domain/application/view-model receive query data as plain values',
      severity: 'error',
      from: {
        path: '^src/contexts/[^/]+/',
        pathNot: '^src/contexts/[^/]+/presenter/',
      },
      to: {
        path: '^@tanstack/react-query($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'kernel-cant-import-app-code',
      comment:
        'kernel/ owns cross-context types and re-exports — it must not import contexts, widgets, coordinator, routes, or design-system',
      severity: 'error',
      from: { path: '^src/kernel/' },
      to: {
        path: '^src/(contexts|widgets|coordinator|routes|design-system)/',
      },
    },
    {
      name: 'production-cant-import-fixtures',
      comment:
        '__fixtures__/ folders contain test-only fakes — production (non-test) code must not import from them',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: '\\.(test|spec)\\.(ts|tsx)$',
      },
      to: {
        path: '/__fixtures__/',
      },
    },
    {
      name: 'board-domain-only-imports-kernel',
      comment:
        "board's domain layer is pure: it may only import from ~/kernel and its own peers.",
      severity: 'error',
      from: { path: '^src/contexts/board/domain/' },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/board/domain/|src/kernel/)',
      },
    },
    {
      name: 'board-application-only-imports-kernel-and-self',
      comment:
        "board's application layer talks to gateway/cache ports declared inside the context — it may only import ~/kernel and its own peers",
      severity: 'error',
      from: {
        path: '^src/contexts/board/application/',
        pathNot: '/__fixtures__/',
      },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/board/application/|src/kernel/)',
      },
    },
    {
      name: 'board-view-model-only-imports-kernel-and-domain',
      comment:
        "board's view-model is framework-free; it may only import ~/kernel, its own domain, and its own peers",
      severity: 'error',
      from: { path: '^src/contexts/board/view-model/' },
      to: {
        path: '^src/',
        pathNot:
          '^(src/contexts/board/view-model/|src/contexts/board/domain/|src/kernel/)',
      },
    },
    {
      name: 'detail-domain-only-imports-kernel',
      comment:
        "detail's domain layer is pure: it may only import from ~/kernel and its own peers",
      severity: 'error',
      from: { path: '^src/contexts/detail/domain/' },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/detail/domain/|src/kernel/)',
      },
    },
    {
      name: 'detail-application-only-imports-kernel-and-self',
      comment:
        "detail's application layer talks to gateway/cache ports declared inside the context — it may only import ~/kernel and its own peers",
      severity: 'error',
      from: {
        path: '^src/contexts/detail/application/',
        pathNot: '/__fixtures__/',
      },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/detail/application/|src/kernel/)',
      },
    },
    {
      name: 'detail-view-model-only-imports-kernel-and-domain',
      comment:
        "detail's view-model is framework-free; it may only import ~/kernel, its own domain, and its own peers",
      severity: 'error',
      from: { path: '^src/contexts/detail/view-model/' },
      to: {
        path: '^src/',
        pathNot:
          '^(src/contexts/detail/view-model/|src/contexts/detail/domain/|src/kernel/)',
      },
    },
    {
      name: 'capture-domain-only-imports-kernel',
      comment:
        "capture's domain layer is pure: it may only import from ~/kernel and its own peers",
      severity: 'error',
      from: { path: '^src/contexts/capture/domain/' },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/capture/domain/|src/kernel/)',
      },
    },
    {
      name: 'capture-application-only-imports-kernel-and-self',
      comment:
        "capture's application layer talks to gateway ports declared inside the context — it may only import ~/kernel and its own peers",
      severity: 'error',
      from: {
        path: '^src/contexts/capture/application/',
        pathNot: '/__fixtures__/',
      },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/capture/application/|src/kernel/)',
      },
    },
    {
      name: 'capture-view-model-only-imports-kernel-and-domain',
      comment:
        "capture's view-model is framework-free; it may only import ~/kernel, its own domain, and its own peers",
      severity: 'error',
      from: { path: '^src/contexts/capture/view-model/' },
      to: {
        path: '^src/',
        pathNot:
          '^(src/contexts/capture/view-model/|src/contexts/capture/domain/|src/kernel/)',
      },
    },
    {
      name: 'review-application-only-imports-kernel-and-self',
      comment:
        "review's application layer talks to gateway/cache ports declared inside the context — it may only import ~/kernel and its own peers",
      severity: 'error',
      from: {
        path: '^src/contexts/review/application/',
        pathNot: '/__fixtures__/',
      },
      to: {
        path: '^src/',
        pathNot: '^(src/contexts/review/application/|src/kernel/)',
      },
    },
    {
      name: 'widgets-stay-out-of-contexts',
      comment:
        'widgets are reusable visual surfaces — they must not depend on any bounded context. Cross-cutting wiring belongs at the route or coordinator layer.',
      severity: 'error',
      from: { path: '^src/widgets/' },
      to: { path: '^src/contexts/' },
    },
    {
      name: 'coordinator-cant-see-context-views',
      comment:
        "coordinator orchestrates contexts via their public ports — it must not reach into a context's view, presenter, or view-model. Cross-context wiring goes through ports + application services.",
      severity: 'error',
      from: { path: '^src/coordinator/' },
      to: { path: '^src/contexts/[^/]+/(view|presenter|view-model)/' },
    },
    {
      name: 'coordinator-effects-only-in-adapters',
      comment:
        'inside coordinator/, react / @tanstack/react-* / sonner live only at the framework boundary: adapters/, provider.tsx, and hooks.ts (presenter-helper hooks). The coordinator factory itself (coordinator.ts, ports.ts, errors.ts) stays framework-free.',
      severity: 'error',
      from: {
        path: '^src/coordinator/',
        pathNot: [
          '^src/coordinator/adapters/',
          '^src/coordinator/provider\\.tsx$',
          '^src/coordinator/hooks\\.ts$',
        ],
      },
      to: {
        path: '^(react|react-dom|@tanstack/react-[^/]+|sonner)($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'context-inner-layers-cant-import-coordinator-adapters-or-provider',
      comment:
        'a context\'s domain / application / view-model layers can only see coordinator ports + the useCoordinator hook (via presenter). They must not depend on the runtime adapters or the provider composition root.',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/(domain|application|view-model)/' },
      to: { path: '^src/coordinator/(adapters/|provider\\.tsx$)' },
    },
    {
      name: 'no-tanstack-query-in-widgets-outside-presenter',
      comment:
        'inside widgets/, @tanstack/react-query lives only in presenter/ — view, view-model, and domain receive query data via the coordinator hooks or as plain values.',
      severity: 'error',
      from: {
        path: '^src/widgets/[^/]+/',
        pathNot: '^src/widgets/[^/]+/presenter/',
      },
      to: {
        path: '^@tanstack/react-query($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'no-features-folder',
      comment:
        'src/features/ no longer exists in this architecture — components live in contexts/ (bounded contexts), widgets/ (reusable surfaces), routes/ (route shell), or lib/ (utilities). Any import to or from features/ is a CI failure.',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'no-effect-on-client',
      comment:
        'effect is server-only — client code (contexts, widgets, coordinator, routes, kernel) consumes the wire shape via neverthrow, not Effect values directly.',
      severity: 'error',
      from: {
        path: '^src/(contexts|widgets|coordinator|routes|kernel)/',
      },
      to: {
        path: '^effect($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'no-neverthrow-on-server',
      comment:
        'neverthrow is client-only — server code uses Effect for result handling and turns it into the wire shape at the boundary via toWire.',
      severity: 'error',
      from: { path: '^src/server/' },
      to: {
        path: '^neverthrow($|/)',
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
      },
    },
    {
      name: 'no-cross-context-server',
      comment:
        'a server bounded context cannot import another server bounded context — cross-context composition for reads happens at the server-function layer.',
      severity: 'error',
      from: {
        path: '^src/server/contexts/([^/]+)/',
      },
      to: {
        path: '^src/server/contexts/([^/]+)/',
        pathNot: '^src/server/contexts/$1/',
      },
    },
    {
      name: 'no-cross-gateway-adapter',
      comment:
        'a server gateway adapter must not import another gateway — gateways are peers, and cross-system orchestration belongs in a context application service that depends on both gateway ports.',
      severity: 'error',
      from: {
        path: '^src/server/gateways/([^/]+)/',
      },
      to: {
        path: '^src/server/gateways/([^/]+)/',
        pathNot: '^src/server/gateways/$1/',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: { path: '^src/' },
    exclude: { path: 'src/routeTree\\.gen\\.ts' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: {
      dot: {
        filters: {
          includeOnly: { path: '^src/' },
        },
        theme: {
          graph: { rankdir: 'LR', splines: 'ortho' },
        },
      },
      archi: {
        collapsePattern:
          '^src/server/contexts/[^/]+/[^/]+|^src/server/gateways/[^/]+|^src/server/[^/]+|^src/contexts/[^/]+/[^/]+|^src/widgets/[^/]+|^src/[^/]+',
        theme: {
          graph: { rankdir: 'LR', splines: 'ortho' },
        },
      },
    },
  },
}
