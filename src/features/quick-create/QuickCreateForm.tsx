import { useEffect, useRef, useState, type RefObject } from 'react'
import { useForm } from '@tanstack/react-form'
import { ChevronDown } from 'lucide-react'
import { quickCreateSchema, type QuickCreateInput } from '~/server/jira/quick-create-schema'
import { HARDCODED_PARENTS } from './hardcoded-parents'
import { SummaryInput } from './SummaryInput'
import { TypeSegmented } from './TypeSegmented'
import { useCreateIssueMutation } from './use-create-issue-mutation'

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
  closeModal,
}: {
  summaryRef: RefObject<HTMLInputElement | null>
  closeModal: () => void
}) {
  const mutateAsyncRef = useRef<((value: QuickCreateInput) => Promise<unknown>) | null>(null)

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: quickCreateSchema },
    onSubmit: async ({ value }) => {
      await mutateAsyncRef.current?.(value)
    },
  })

  const mutation = useCreateIssueMutation({
    closeModal,
    resetForm: () => form.reset(),
  })

  mutateAsyncRef.current = mutation.mutateAsync

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="flex flex-col gap-3"
    >
      <form.Field
        name="type"
        children={(field) => (
          <div>
            <span className={REQUIRED_LABEL_CLASS}>
              Type{REQUIRED_ASTERISK}
            </span>
            <TypeSegmented value={field.state.value} onChange={field.handleChange} />
          </div>
        )}
      />

      <form.Field
        name="parentKey"
        children={(field) => (
          <div>
            <label className={REQUIRED_LABEL_CLASS}>Parent{REQUIRED_ASTERISK}</label>
            <ParentDropdown
              value={field.state.value}
              onChange={(key) => {
                field.handleChange(key)
                field.handleBlur()
              }}
            />
          </div>
        )}
      />

      <form.Field
        name="summary"
        children={(field) => (
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
      />

      <form.Field
        name="description"
        children={(field) => (
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
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={closeModal}
          className="border-border text-foreground hover:bg-muted/60 focus-visible:ring-ring rounded border px-3 py-1.5 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
        >
          Cancel
        </button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          children={([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || mutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Create
            </button>
          )}
        />
      </div>
    </form>
  )
}

function ParentDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const selected = HARDCODED_PARENTS.find((p) => p.key === value) ?? null

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${INPUT_CLASS} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? `${selected.key} · ${selected.label}` : 'Select a parent…'}
        </span>
        <ChevronDown size={14} className="text-muted-foreground ml-2 shrink-0" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="border-border bg-popover absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-md border py-1 text-xs shadow-lg"
        >
          {HARDCODED_PARENTS.map((parent) => {
            const isSelected = parent.key === value
            return (
              <li key={parent.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(parent.key)
                    setOpen(false)
                  }}
                  className="hover:bg-muted/60 text-foreground flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                >
                  <span className="text-muted-foreground font-mono">{parent.key}</span>
                  <span>·</span>
                  <span className="flex-1 truncate">{parent.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
