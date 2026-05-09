import { match } from 'ts-pattern'
import { StatusPillSelect } from '~/widgets/status-pill'
import { TypeIcon, colorForLabel } from '~/widgets/ticket-card'
import { Mr, type RootState } from '~/widgets/mr-section'
import { useBoardData, useMrFor } from '~/coordinator'
import { columnForStatus, type DetailIssue } from '~/kernel'
import { Field } from './Field'

export function PropertiesRail({ issue }: { issue: DetailIssue }) {
  return (
    <aside className="flex flex-col gap-4 text-xs">
      <Field label="Status">
        <StatusPillSelect issueKey={issue.key} status={issue.statusName} />
      </Field>
      <Field label="Type">
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon type={issue.typeName} />
          <span className="text-foreground">{issue.typeName}</span>
        </span>
      </Field>
      <Field label="Priority">
        <span className="text-foreground">{issue.priorityName ?? '—'}</span>
      </Field>
      <Field label="Assignee">
        <span className="text-foreground">{issue.assigneeName ?? 'Unassigned'}</span>
      </Field>
      <Field label="Reporter">
        <span className="text-foreground">{issue.reporterName ?? '—'}</span>
      </Field>
      <Field label="Labels">
        {issue.labels.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {issue.labels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForLabel(label) }}
                />
                <span className="text-foreground">{label}</span>
              </span>
            ))}
          </div>
        )}
      </Field>
      <PanelMrBlock issueKey={issue.key} />
    </aside>
  )
}

function PanelMrBlock({ issueKey }: { issueKey: string }) {
  const result = useMrFor(issueKey)
  const board = useBoardData()
  const issue = board.data?.ok ? board.data.issues.find((i) => i.key === issueKey) : null
  const column = issue ? columnForStatus(issue.statusName) : null

  const state: RootState = match(result.state)
    .with('idle', () => ({ kind: 'idle' }) as RootState)
    .with('unavailable', () => ({ kind: 'idle' }) as RootState)
    .with('loading', () => ({ kind: 'loading' }) as RootState)
    .with('ready', () => ({ kind: 'ready' }) as RootState)
    .exhaustive()
  const summary = result.state === 'ready' ? result.summary : null

  return (
    <Mr.Root state={state} summary={summary} layout="stack" issueKey={issueKey} column={column}>
      <Mr.ReviewerStack />
      <Mr.WarningRow />
      <Mr.OpenLink />
    </Mr.Root>
  )
}
