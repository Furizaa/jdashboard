import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { loadSkillBody, spawnClaude } from '../lib/claude-cli'
import { runRoute, type RouteMatch, type RouteTicket } from '../lib/route-transcript'

// Bulk-refine stage 1: route a pasted meeting transcript to the board tickets it
// discusses. This handler only *routes* — it returns the per-ticket briefs and
// writes nothing. Stage 2 is the existing `refineNote` handler, fanned out from
// the client over the matched keys (one refine per ticket, so per-ticket
// progress and cache invalidation reuse the single-note path unchanged).

export type RouteTranscriptResult =
  | { readonly ok: true; readonly matches: readonly RouteMatch[] }
  | { readonly ok: false; readonly error: { readonly message: string } }

const ROUTE_SKILL_PATH = join(process.cwd(), '.claude', 'skills', 'route-transcript', 'SKILL.md')

// Cap the routing input: a transcript is one meeting, and the ticket list is one
// board. Both are generous ceilings that only guard against a pathological paste.
const MAX_TRANSCRIPT_CHARS = 200_000
const MAX_TICKETS = 500

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Accept only well-formed { key, summary } entries; drop anything malformed
// rather than trust the client shape. Keys are capped/trimmed defensively.
function sanitizeTickets(value: unknown): RouteTicket[] {
  if (!Array.isArray(value)) return []
  const out: RouteTicket[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as { key?: unknown; summary?: unknown; epic?: unknown; labels?: unknown }
    const key = str(row.key).trim()
    const summary = str(row.summary).trim()
    if (key === '') continue
    const epicName = str(row.epic).trim()
    const labels = Array.isArray(row.labels)
      ? row.labels.filter((l): l is string => typeof l === 'string')
      : []
    out.push({ key, summary, epic: epicName === '' ? null : epicName, labels })
    if (out.length >= MAX_TICKETS) break
  }
  return out
}

export const routeTranscript = createServerFn({ method: 'POST' })
  .inputValidator((data: { transcript: string; tickets: readonly RouteTicket[] }) => {
    const transcript = str(data?.transcript).trim()
    if (transcript === '') throw new Error('routeTranscript (transcript): required')
    const tickets = sanitizeTickets(data?.tickets)
    if (tickets.length === 0) throw new Error('routeTranscript (tickets): required')
    return { transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARS), tickets }
  })
  .handler(async ({ data }): Promise<RouteTranscriptResult> => {
    let skillBody: string
    try {
      skillBody = await loadSkillBody(ROUTE_SKILL_PATH)
    } catch {
      return {
        ok: false,
        error: { message: 'bulk-refine routing skill is missing from the app install' },
      }
    }

    const parsed = await runRoute(
      { transcript: data.transcript, tickets: data.tickets, skillBody },
      spawnClaude,
    )
    if (!parsed.ok) return parsed
    return { ok: true, matches: parsed.matches }
  })
