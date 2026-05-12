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

const REQUIRED_LABEL_CLASS = 'text-ink-subtle mb-1.5 block text-[11px] font-medium tracking-wide'
const REQUIRED_ASTERISK = (
  <span aria-hidden="true" className="text-destructive ml-0.5">
    *
  </span>
)
const INPUT_CLASS =
  'border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong w-full rounded-md border px-2.5 py-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none'

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
      className="flex flex-col gap-4"
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
              className={`${INPUT_CLASS} resize-y leading-[1.5]`}
            />
          </div>
        )}
      </form.Field>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        >
          Cancel
        </button>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Create
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
