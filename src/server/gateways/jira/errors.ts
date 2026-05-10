import { Schema } from 'effect'

// Class names are gateway-prefixed; wire tags (`Unauthorized` / `NotFound` /
// `Rejected` / `TransportError`) stay un-prefixed because clients already
// discriminate by gateway via the response envelope, not the tag string.
export class JiraUnauthorized extends Schema.TaggedError<JiraUnauthorized>()('Unauthorized', {}) {}
export class JiraNotFound extends Schema.TaggedError<JiraNotFound>()('NotFound', {}) {}
export class JiraRejected extends Schema.TaggedError<JiraRejected>()('Rejected', {
  message: Schema.String,
}) {}
// Network failure, body-encoding failure, or response-decode failure — the
// request never produced a meaningful upstream answer. Distinct from `Rejected`
// (4xx with body) so per-context error unions can choose to surface or demote.
export class JiraTransportError extends Schema.TaggedError<JiraTransportError>()('TransportError', {
  message: Schema.String,
}) {}
export class MediaResolutionError extends Schema.TaggedError<MediaResolutionError>()(
  'MediaResolutionError',
  { message: Schema.String, status: Schema.Number },
) {}
export class MediaNotFound extends Schema.TaggedError<MediaNotFound>()('MediaNotFound', {}) {}

export type JiraGatewayError = JiraUnauthorized | JiraNotFound | JiraRejected | JiraTransportError
