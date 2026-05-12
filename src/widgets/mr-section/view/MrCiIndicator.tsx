import { AlertTriangle, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { match } from 'ts-pattern'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { CiVisualState } from '~/kernel'

const ICON_CLASS = 'h-3 w-3 shrink-0'

export function MrCiIndicator({ state, className }: { state: CiVisualState; className?: string }) {
  if (state === 'none') return null
  const { label, icon } = render(state)
  return (
    <span
      data-testid={testIds.ciIndicator}
      data-state={state}
      title={label}
      className={cn('inline-flex items-center', className)}
    >
      {icon}
    </span>
  )
}

function render(state: Exclude<CiVisualState, 'none'>) {
  return match(state)
    .with('conflict', () => ({
      label: 'Merge conflict',
      icon: <AlertTriangle className={`${ICON_CLASS} text-amber-500`} aria-hidden />,
    }))
    .with('failed', () => ({
      label: 'CI failed',
      icon: <XCircle className={`${ICON_CLASS} text-[oklch(0.65_0.22_25)]`} aria-hidden />,
    }))
    .with('running', () => ({
      label: 'CI running',
      icon: <Loader2 className={`${ICON_CLASS} text-ink-subtle animate-spin`} aria-hidden />,
    }))
    .with('passed', () => ({
      label: 'CI passed',
      icon: <CheckCircle className={`${ICON_CLASS} text-[oklch(0.68_0.18_145)]`} aria-hidden />,
    }))
    .exhaustive()
}
