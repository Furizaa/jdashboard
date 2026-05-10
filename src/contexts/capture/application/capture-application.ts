import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { EpicRef, QuickCreateInput } from '~/kernel'
import {
  CaptureEpicsNetworkError,
  CaptureEpicsUnauthorized,
  CaptureNetworkError,
  CaptureRejected,
  CaptureUnauthorized,
  type CaptureLoadEpicsError,
  type CaptureSubmitError,
} from './errors'
import type { CaptureGateway } from './ports'

export type CaptureSubmitSnapshot = {
  key: string
  baseUrl: string
}

export type CaptureEpicsSnapshot = {
  epics: readonly EpicRef[]
}

export type CaptureApplicationService = {
  submit(
    input: QuickCreateInput,
    signal?: AbortSignal,
  ): ResultAsync<CaptureSubmitSnapshot, CaptureSubmitError>
  loadEpics(): ResultAsync<CaptureEpicsSnapshot, CaptureLoadEpicsError>
}

export type CaptureApplicationDeps = {
  gateway: CaptureGateway
}

export function createCaptureApplicationService(
  deps: CaptureApplicationDeps,
): CaptureApplicationService {
  return {
    submit: (input, signal) =>
      ResultAsync.fromPromise(
        deps.gateway.createIssue(input, signal),
        (e): CaptureSubmitError =>
          new CaptureNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ key, baseUrl }) =>
            okAsync<CaptureSubmitSnapshot, CaptureSubmitError>({ key, baseUrl }),
          )
          .with({ ok: false, error: { _tag: 'Unauthorized' } }, () =>
            errAsync<CaptureSubmitSnapshot, CaptureSubmitError>(new CaptureUnauthorized()),
          )
          .with({ ok: false, error: { _tag: 'Rejected' } }, ({ error }) =>
            errAsync<CaptureSubmitSnapshot, CaptureSubmitError>(new CaptureRejected(error.message)),
          )
          .with({ ok: false, error: { _tag: 'TransportError' } }, ({ error }) =>
            errAsync<CaptureSubmitSnapshot, CaptureSubmitError>(
              new CaptureNetworkError(error.message),
            ),
          )
          .exhaustive(),
      ),

    loadEpics: () =>
      ResultAsync.fromPromise(
        deps.gateway.loadMyEpics(),
        (e): CaptureLoadEpicsError =>
          new CaptureEpicsNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ epics }) =>
            okAsync<CaptureEpicsSnapshot, CaptureLoadEpicsError>({ epics }),
          )
          .with({ ok: false, error: { _tag: 'Unauthorized' } }, () =>
            errAsync<CaptureEpicsSnapshot, CaptureLoadEpicsError>(new CaptureEpicsUnauthorized()),
          )
          .exhaustive(),
      ),
  }
}
