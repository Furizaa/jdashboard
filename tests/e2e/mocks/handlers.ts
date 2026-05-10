import { delay, http, HttpResponse, type HttpHandler } from 'msw'
import type { World } from '../world/World'

// Tiny 1×1 transparent PNG (44 bytes) — used by the media-lightbox e2e to
// satisfy the browser's image decoder when the lightbox opens an `<img>` so
// the inline preview's `onerror` doesn't fire and swap in MediaUnavailable.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAcCBlCwAAAABJRU5ErkJggg=='

function tinyPngBytes(): Uint8Array {
  const binary = atob(TINY_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0
  return bytes
}

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
      let mrs: ReturnType<typeof world.listMrsByAuthor> = []
      if (author !== null) mrs = world.listMrsByAuthor(author)
      else if (reviewer !== null) mrs = world.listMrsByReviewer(reviewer)
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

    // Jira media-tokens endpoint — returned as a canned bundle so the
    // server-side `getMediaMetadata` resolves with the expected shape during
    // a Detail-panel load. The e2e fixture seeds `attrs.url` directly, so the
    // proxy flow is bypassed end-to-end; this handler exists for parity with
    // the production wire shape and so any future spec exercising the proxy
    // route has a predictable response.
    http.post('*/rest/api/3/media-tokens', async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as { ids?: string[] }
      const ids = Array.isArray(body.ids) ? body.ids : []
      return HttpResponse.json({
        endpointUrl: 'http://127.0.0.1:9999/media-binary',
        token: 'canned-token',
        items: ids.map((id) => ({ id, mimeType: 'image/png' })),
      })
    }),

    // Proxy URL injected into ADF media nodes after server-side enrichment.
    // The e2e fixture seeds `attrs.url = http://127.0.0.1:9999/api/jira-media/<id>`
    // so the browser's <img>/<video> fetch lands on this MSW handler instead
    // of round-tripping through the clashboard server's binary route.
    http.get('*/api/jira-media/:id', async ({ params }) => {
      const id = String(params.id)
      if (id === 'missing' || id.startsWith('missing-')) {
        return new HttpResponse('Media not found', { status: 404 })
      }
      if (id.startsWith('video-')) {
        // Hold the response open: the browser's <video preload="metadata">
        // stays in loading state long enough for the spec to observe the
        // element's attributes without `onerror` firing and swapping in
        // MediaUnavailable. The test completes well within this window.
        await delay(30_000)
        return new HttpResponse(new Uint8Array(0), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        })
      }
      const bytes = tinyPngBytes()
      return new HttpResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': bytes.byteLength.toString(),
        },
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
