import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { AllowedTransition, DetailIssue } from '../gateways/jira/types'
import { DetailConfigLive } from '../contexts/detail/config'
import {
  LoadIssueError,
  LoadTransitionsError,
  PerformTransitionError,
} from '../contexts/detail/errors'
import { loadIssue } from '../contexts/detail/application/load-issue'
import { loadTransitions } from '../contexts/detail/application/load-transitions'
import { performTransition } from '../contexts/detail/application/perform-transition'
import { assertIssueKey } from '../lib/jql'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

type LoadIssueErrorWire = Schema.Schema.Encoded<typeof LoadIssueError>
type LoadTransitionsErrorWire = Schema.Schema.Encoded<typeof LoadTransitionsError>
type PerformTransitionErrorWire = Schema.Schema.Encoded<typeof PerformTransitionError>

export type GetIssueResult = WireResult<
  { readonly baseUrl: string; readonly issue: DetailIssue },
  LoadIssueErrorWire
>

export type GetTransitionsResult = WireResult<
  { readonly transitions: readonly AllowedTransition[] },
  LoadTransitionsErrorWire
>

export type TransitionIssueResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: PerformTransitionErrorWire }

function requireIssueKey(label: string, value: unknown): string {
  return assertIssueKey(typeof value === 'string' ? value : '', label)
}

function requireTransitionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('transitionIssue (transitionId): required')
  }
  return value.trim()
}

export const getIssue = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({ key: requireIssueKey('getIssue', data?.key) }))
  .handler(async ({ data }): Promise<GetIssueResult> => {
    const program = loadIssue(data.key).pipe(Effect.provide(DetailConfigLive))
    return runWire(program, LoadIssueError, 'getIssue')
  })

export const getTransitions = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({
    key: requireIssueKey('getTransitions', data?.key),
  }))
  .handler(
    async ({ data }): Promise<GetTransitionsResult> =>
      runWire(loadTransitions(data.key), LoadTransitionsError, 'getTransitions'),
  )

export const transitionIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; transitionId: string }) => ({
    key: requireIssueKey('transitionIssue', data?.key),
    transitionId: requireTransitionId(data?.transitionId),
  }))
  .handler(
    async ({ data }): Promise<TransitionIssueResult> =>
      runWire(
        performTransition(data.key, data.transitionId),
        PerformTransitionError,
        'transitionIssue',
      ),
  )
