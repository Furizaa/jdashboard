import { useRef, type KeyboardEvent } from 'react'
import { TYPE_STYLES, type TypeStyle } from '~/features/ticket-card/type-styles'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'

type Type = QuickCreateInput['type']

const TYPES: ReadonlyArray<{ value: Type; style: TypeStyle }> = [
  { value: 'Bug', style: TYPE_STYLES.bug },
  { value: 'Task', style: TYPE_STYLES.task },
  { value: 'Improvement', style: TYPE_STYLES.improvement },
]

export function TypeSegmented({
  value,
  onChange,
}: {
  value: Type
  onChange: (next: Type) => void
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])

  const moveTo = (index: number) => {
    const wrapped = (index + TYPES.length) % TYPES.length
    const next = TYPES[wrapped]
    if (!next) return
    onChange(next.value)
    buttonsRef.current[wrapped]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo(currentIndex + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo(currentIndex - 1)
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      const current = TYPES[currentIndex]
      if (current) onChange(current.value)
    }
  }

  return (
    <div role="radiogroup" aria-label="Type" className="flex gap-1.5">
      {TYPES.map((entry, i) => {
        const { Icon } = entry.style
        const selected = entry.value === value
        return (
          <button
            key={entry.value}
            ref={(el) => {
              buttonsRef.current[i] = el
            }}
            type="button"
            // styled radio implemented as button + role="radio" + roving tabindex;
            // native <input type="radio"> does not support custom layout/focus management here
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.value)}
            onKeyDown={(event) => handleKeyDown(event, i)}
            className="focus-visible:ring-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none"
            style={
              selected
                ? {
                    backgroundColor: entry.style.color,
                    borderColor: entry.style.color,
                    color: '#fff',
                  }
                : {
                    backgroundColor: entry.style.bg,
                    borderColor: 'transparent',
                    color: entry.style.color,
                  }
            }
          >
            <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>{entry.value}</span>
          </button>
        )
      })}
    </div>
  )
}
