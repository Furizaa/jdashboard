/// <reference types="vite/client" />
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'
import globalsCss from '~/styles/globals.css?url'
import { CoordinatorProvider } from '~/coordinator'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'clashboard' },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <CoordinatorProvider>
          <Outlet />
          <Toaster theme="dark" position="bottom-right" />
        </CoordinatorProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

const E2E_FLAG_SCRIPT =
  "if(typeof location!=='undefined'&&/(?:^|[?&])e2e=1(?:&|$)/.test(location.search))document.documentElement.dataset.e2e='1'"

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: E2E_FLAG_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
