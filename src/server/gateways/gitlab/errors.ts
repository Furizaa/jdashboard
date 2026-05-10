import { Schema } from 'effect'

// Class names are gateway-prefixed; wire tags (`Unauthorized` / `NotFound` /
// `Rejected` / `TransportError`) stay un-prefixed because clients already
// discriminate by gateway via the response envelope, not the tag string.
export class GitlabUnauthorized extends Schema.TaggedError<GitlabUnauthorized>()(
  'Unauthorized',
  {},
) {}
export class GitlabNotFound extends Schema.TaggedError<GitlabNotFound>()('NotFound', {}) {}
export class GitlabRejected extends Schema.TaggedError<GitlabRejected>()('Rejected', {
  message: Schema.String,
}) {}
// Network failure or response-decode failure — the request never produced a
// meaningful upstream answer. Distinct from `Rejected` (4xx with body) so
// per-context error unions can choose to surface or demote.
export class GitlabTransportError extends Schema.TaggedError<GitlabTransportError>()(
  'TransportError',
  { message: Schema.String },
) {}

export type GitlabGatewayError =
  | GitlabUnauthorized
  | GitlabNotFound
  | GitlabRejected
  | GitlabTransportError
