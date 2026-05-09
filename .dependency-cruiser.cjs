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
