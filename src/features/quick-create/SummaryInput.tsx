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
    <div className="border-border bg-background focus-within:ring-ring flex w-full items-center rounded border px-2 py-1.5 text-xs focus-within:ring-1">
      <span aria-hidden="true" className="text-muted-foreground select-none">
        [FE]:&nbsp;
      </span>
      <input
        id="quick-create-summary"
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Summary, prefixed with FE colon"
        className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent p-0 focus:outline-none"
      />
    </div>
  )
}
