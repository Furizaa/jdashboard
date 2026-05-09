import { useEffect, type RefObject } from 'react'
import { useForm } from '@tanstack/react-form'
import type { Result } from 'neverthrow'
import { quickCreateSchema, type QuickCreateInput } from '~/kernel'
import type { CreateIssueError, CreateIssueSnapshot } from '~/coordinator'
import { ParentSelect } from './ParentSelect'
import { SummaryInput } from './SummaryInput'
import { TypeSegmented } from './TypeSegmented'

const DEFAULT_VALUES: QuickCreateInput = {
  type: 'Bug',
  parentKey: '',
  summary: '',
  description: '',
}

const REQUIRED_LABEL_CLASS = 'text-foreground mb-1 block text-xs font-medium'
const REQUIRED_ASTERISK = (
  <span aria-hidden="true" className="text-destructive ml-0.5">
    *
  </span>
)
const INPUT_CLASS =
  'border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded border px-2 py-1.5 text-xs focus-visible:ring-1 focus-visible:outline-none'

export function QuickCreateForm({
  summaryRef,
  open,
  isPending,
  onCancel,
  onSubmit,
  registerReset,
}: {
  summaryRef: RefObject<HTMLInputElement | null>
  open: boolean
  isPending: boolean
  onCancel: () => void
  onSubmit: (input: QuickCreateInput) => Promise<Result<CreateIssueSnapshot, CreateIssueError>>
  registerReset: (reset: () => void) => void
}) {
  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: quickCreateSchema },
    onSubmit: async ({ value }) => {
      await onSubmit(value)
    },
  })

  useEffect(() => {
    registerReset(() => form.reset())
  }, [registerReset, form])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="flex flex-col gap-3"
    >
      <form.Field name="type">
        {(field) => (
          <div>
            <span className={REQUIRED_LABEL_CLASS}>Type{REQUIRED_ASTERISK}</span>
            <TypeSegmented value={field.state.value} onChange={field.handleChange} />
          </div>
        )}
      </form.Field>

      <form.Field name="parentKey">
        {(field) => (
          <div>
            <label className={REQUIRED_LABEL_CLASS}>Parent{REQUIRED_ASTERISK}</label>
            <ParentSelect
              value={field.state.value}
              open={open}
              onChange={(key) => {
                field.handleChange(key)
                field.handleBlur()
              }}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="summary">
        {(field) => (
          <div>
            <label htmlFor="quick-create-summary" className={REQUIRED_LABEL_CLASS}>
              Summary{REQUIRED_ASTERISK}
            </label>
            <SummaryInput
              value={field.state.value}
              onChange={field.handleChange}
              inputRef={summaryRef}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div>
            <label htmlFor="quick-create-description" className={REQUIRED_LABEL_CLASS}>
              Description{REQUIRED_ASTERISK}
            </label>
            <textarea
              id="quick-create-description"
              rows={6}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              className={`${INPUT_CLASS} resize-y`}
            />
          </div>
        )}
      </form.Field>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="border-border text-foreground hover:bg-muted/60 focus-visible:ring-ring rounded border px-3 py-1.5 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        >
          Cancel
        </button>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Create
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
