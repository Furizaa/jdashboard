import { useRef, type KeyboardEvent } from 'react'
import { TYPE_STYLES, type TypeStyle } from '~/widgets/ticket-card'
import type { QuickCreateInput } from '~/kernel'

type Type = QuickCreateInput['type']

const TYPES: ReadonlyArray<{ value: Type; style: TypeStyle }> = [
  { value: 'Bug', style: TYPE_STYLES.bug },
  { value: 'Task', style: TYPE_STYLES.task },
  { value: 'Improvement', style: TYPE_STYLES.improvement },
]

type Intent = 'next' | 'prev' | 'select'
const KEY_INTENTS: Readonly<Record<string, Intent>> = {
  ArrowRight: 'next',
  ArrowDown: 'next',
  ArrowLeft: 'prev',
  ArrowUp: 'prev',
  ' ': 'select',
  Enter: 'select',
}

function arrowIntent(key: string): Intent | null {
  return KEY_INTENTS[key] ?? null
}

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
    const intent = arrowIntent(event.key)
    if (intent === null) return
    event.preventDefault()
    if (intent === 'next') moveTo(currentIndex + 1)
    else if (intent === 'prev') moveTo(currentIndex - 1)
    else {
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
