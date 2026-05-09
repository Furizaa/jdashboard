import { Schema } from 'effect'

// Class names are gateway-prefixed; wire tags stay un-prefixed because clients
// already discriminate by gateway via the response envelope, not the tag string.
export class JiraUnauthorized extends Schema.TaggedError<JiraUnauthorized>()('Unauthorized', {}) {}
export class JiraNotFound extends Schema.TaggedError<JiraNotFound>()('NotFound', {}) {}
export class JiraRejected extends Schema.TaggedError<JiraRejected>()('Rejected', {
  message: Schema.String,
}) {}

export type JiraGatewayError = JiraUnauthorized | JiraNotFound | JiraRejected
