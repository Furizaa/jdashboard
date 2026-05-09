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

    http.get('*/rest/api/3/issue/:key/transitions', ({ params }) => {
      const transitions = getWorld().getTransitions(String(params.key))
      return HttpResponse.json({
        transitions: transitions.map((t) => ({
          id: t.id,
          name: t.name,
          to: { name: t.toStatusName },
        })),
      })
    }),

    http.post('*/rest/api/3/issue/:key/transitions', async ({ params, request }) => {
      const body = (await request.json()) as { transition?: { id?: string } }
      const transitionId = body.transition?.id ?? ''
      getWorld().transitionIssue(String(params.key), transitionId)
      return new HttpResponse(null, { status: 204 })
    }),

    // Single-issue GET — serves the detail-panel fetch. Returns the issue's
    // shape regardless of the `expand` / `fields` query string. World.getIssueDetail
    // merges any seeded detail extras (description, comments, parent, issuelinks)
    // onto the base RawIssue.
    http.get('*/rest/api/3/issue/:key', ({ params }) => {
      const detail = getWorld().getIssueDetail(String(params.key))
      if (detail === null) {
        return HttpResponse.json(
          { errorMessages: [`Issue not found: ${String(params.key)}`] },
          { status: 404 },
        )
      }
      return HttpResponse.json(detail)
    }),

    // GitLab — handlers read from the World's GitLab state. When nothing has
    // been seeded the World returns empty results, so the smoke board's
    // mr-status fetch resolves to "no MRs" without erroring out.
    http.get('*/api/v4/user', () => {
      const u = getWorld().getGitlabCurrentUser()
      return HttpResponse.json({ username: u.username, name: u.displayName })
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests', ({ request }) => {
      const url = new URL(request.url)
      const author = url.searchParams.get('author_username')
      const reviewer = url.searchParams.get('reviewer_username')
      const state = url.searchParams.get('state')
      const world = getWorld()
      let mrs = author !== null ? world.listMrsByAuthor(author) : []
      // reviewer-mode listing is owned by slice 49; for now serve an empty
      // list so the review-cards query doesn't error out on a card-less
      // author-mode test.
      if (reviewer !== null && author === null) mrs = []
      if (state === 'opened' || state === 'closed' || state === 'merged' || state === 'locked') {
        mrs = mrs.filter((m) => m.state === state)
      }
      return HttpResponse.json(
        mrs.map((m) => ({
          iid: m.iid,
          title: m.title,
          web_url: m.webUrl,
          state: m.state,
          draft: m.draft,
          updated_at: m.updatedAt,
        })),
      )
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests/:iid', ({ params }) => {
      const iid = Number(params.iid)
      const mr = getWorld().getMr(iid)
      if (mr === null) {
        return HttpResponse.json({ message: '404 Not Found' }, { status: 404 })
      }
      const reviewers = getWorld().getMrReviewers(iid)
      const pipeline = getWorld().getMrPipeline(iid)
      return HttpResponse.json({
        iid: mr.iid,
        title: mr.title,
        web_url: mr.webUrl,
        state: mr.state,
        draft: mr.draft,
        updated_at: mr.updatedAt,
        reviewers: reviewers.map((r) => ({
          username: r.username,
          name: r.displayName,
          avatar_url: r.avatarUrl,
        })),
        head_pipeline: pipeline.status === null ? null : { status: pipeline.status },
        has_conflicts: pipeline.hasConflicts,
      })
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests/:iid/discussions', ({ params }) => {
      const iid = Number(params.iid)
      const discussions = getWorld().getMrDiscussions(iid)
      return HttpResponse.json(
        discussions.map((d) => ({
          id: d.id,
          notes: d.notes.map((n) => ({
            author: { username: n.authorUsername },
            resolvable: n.resolvable,
            resolved: n.resolved,
            system: n.system,
          })),
        })),
      )
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests/:iid/approvals', ({ params }) => {
      const iid = Number(params.iid)
      const approvals = getWorld().getMrApprovals(iid)
      return HttpResponse.json({
        approved_by: approvals.approvedUsernames.map((username) => ({ user: { username } })),
      })
    }),

    http.get('*/api/v4/projects/:projectPath/merge_requests/:iid/reviewers', ({ params }) => {
      const iid = Number(params.iid)
      const reviewers = getWorld().getMrReviewers(iid)
      return HttpResponse.json(
        reviewers.map((r) => ({
          user: {
            username: r.username,
            name: r.displayName,
            avatar_url: r.avatarUrl,
          },
          state: r.state,
        })),
      )
    }),
  ]
}
