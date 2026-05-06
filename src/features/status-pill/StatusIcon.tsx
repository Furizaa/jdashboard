import type { StatusShape } from './status-color'

const PROGRESS_FRACTION: Record<'progress-25' | 'progress-50' | 'progress-75', number> = {
  'progress-25': 0.25,
  'progress-50': 0.5,
  'progress-75': 0.75,
}

export function StatusIcon({
  shape,
  color,
  size = 12,
}: {
  shape: StatusShape
  color: string
  size?: number
}) {
  const stroke = 1.5

  if (shape === 'todo') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden
        style={{ color, flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth={stroke} />
      </svg>
    )
  }

  if (shape === 'blocked') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden
        style={{ color, flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="6.75" fill="currentColor" />
        <rect x="3.75" y="7" width="8.5" height="2" rx="0.6" fill="#fff" />
      </svg>
    )
  }

  if (shape === 'done') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden
        style={{ color, flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="6.75" fill="currentColor" />
        <path
          d="M5 8.4 L7 10.4 L11 5.8"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  const fraction = PROGRESS_FRACTION[shape]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ color, flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth={stroke} />
      <circle
        cx="8"
        cy="8"
        r="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        pathLength="100"
        strokeDasharray={`${fraction * 100} 100`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}
