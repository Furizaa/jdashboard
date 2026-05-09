/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-context',
      comment:
        'a bounded context cannot import another bounded context — cross-context coordination belongs in coordinator/',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/' },
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
      name: 'no-fixtures-in-production',
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
        "board's domain layer is pure: it may only import from ~/kernel and its own peers — graduated rule active now that contexts/board/ exists",
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
        "detail's domain layer is pure: it may only import from ~/kernel and its own peers — graduated rule active now that contexts/detail/ exists",
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
    },
  },
}
