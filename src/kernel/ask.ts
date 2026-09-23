// Ask answers a question about a ticket with a headless read-only agent
// (see `~/server/server-functions/ask`). The result type is owned server-side and
// re-exported here so the client refers to it without importing `~/server`.
export type { AskTicketResult } from '~/server/server-functions/ask'
