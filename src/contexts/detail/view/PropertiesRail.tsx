import { StatusPillSelect } from '~/features/status-pill'
import { TypeIcon, colorForLabel } from '~/features/ticket-card'
import { MrPanelBlock } from '~/features/mr-status'
import type { DetailIssue } from '~/kernel'
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
      <MrPanelBlock issueKey={issue.key} />
    </aside>
  )
}
