import { Schema } from 'effect'

// Class names are gateway-prefixed; wire tags stay un-prefixed because clients
// already discriminate by gateway via the response envelope, not the tag string.
export class GitlabUnauthorized extends Schema.TaggedError<GitlabUnauthorized>()(
  'Unauthorized',
  {},
) {}
export class GitlabNotFound extends Schema.TaggedError<GitlabNotFound>()('NotFound', {}) {}
export class GitlabRejected extends Schema.TaggedError<GitlabRejected>()('Rejected', {
  message: Schema.String,
}) {}

export type GitlabGatewayError = GitlabUnauthorized | GitlabNotFound | GitlabRejected
