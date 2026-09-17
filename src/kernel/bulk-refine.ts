// Bulk Refine: route one meeting transcript to the board tickets it discusses,
// then refine each matched ticket's note (stage 2 reuses the single-note Refine).
// The wire types are owned by the server-function module and re-exported here so
// the client refers to them through the kernel, never `~/server/...` directly.
export type { RouteTranscriptResult } from '~/server/server-functions/bulk-refine'
export type { RouteMatch } from '~/server/lib/route-transcript'
