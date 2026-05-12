import { type Ref } from 'react'

export function SummaryInput({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (next: string) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <div className="border-border bg-surface-1 focus-within:ring-ring focus-within:border-border-strong flex w-full items-center rounded-md border px-2.5 py-2 text-[13px] transition-colors focus-within:ring-2">
      <span aria-hidden="true" className="text-ink-subtle select-none">
        [FE]:&nbsp;
      </span>
      <input
        id="quick-create-summary"
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Summary, prefixed with FE colon"
        className="text-foreground placeholder:text-ink-tertiary min-w-0 flex-1 border-0 bg-transparent p-0 focus:outline-none"
      />
    </div>
  )
}
