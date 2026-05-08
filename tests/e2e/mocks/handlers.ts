import { http, HttpResponse, type HttpHandler } from 'msw'
import type { World } from '../world/World'

// MSW path-only patterns are resolved against `location.origin` in browser
// contexts. In Node — where we invoke handlers via `getResponse` — there is
// no `location`, so we use wildcard prefixes (`*/...`) to match by pathname
// regardless of host/port.
export function buildHandlers(getWorld: () => World): HttpHandler[] {
  return [
    http.get('*/rest/api/3/myself', () => {
      const me = getWorld().getMyself()
      return HttpResponse.json(me)
    }),

    http.post('*/rest/api/3/search/jql', async ({ request }) => {
      const body = (await request.json()) as { jql?: string }
      const jql = typeof body.jql === 'string' ? body.jql : ''
      return HttpResponse.json(getWorld().searchIssues(jql))
    }),

    // GitLab — minimal stubs that return empty results so the smoke board
    // doesn't error out while loading MR/review data. Specs that exercise
    // GitLab features should add overrides via `mocks.use(...)`.
    http.get('*/api/v4/user', () => {
      return HttpResponse.json({ username: 'e2e-gitlab', name: 'E2E GitLab User' })
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests', () => {
      return HttpResponse.json([])
    }),
  ]
}
