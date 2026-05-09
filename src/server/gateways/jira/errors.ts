import { Schema } from 'effect'

export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {}) {}

export class Rejected extends Schema.TaggedError<Rejected>()('Rejected', {
  message: Schema.String,
}) {}

export type JiraGatewayError = Unauthorized | NotFound | Rejected
