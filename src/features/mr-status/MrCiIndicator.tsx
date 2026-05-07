import { AlertTriangle, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { cn } from '~/lib/cn'
import type { CiVisualState } from './ci-state'

const ICON_CLASS = 'h-3 w-3 shrink-0'

export function MrCiIndicator({ state, className }: { state: CiVisualState; className?: string }) {
  if (state === 'none') return null
  const { label, icon } = render(state)
  return (
    <span title={label} className={cn('inline-flex items-center', className)}>
      {icon}
    </span>
  )
}

function render(state: Exclude<CiVisualState, 'none'>) {
  if (state === 'conflict') {
    return {
      label: 'Merge conflict',
      icon: <AlertTriangle className={`${ICON_CLASS} text-amber-500`} aria-hidden />,
    }
  }
  if (state === 'failed') {
    return {
      label: 'CI failed',
      icon: <XCircle className={`${ICON_CLASS} text-red-500`} aria-hidden />,
    }
  }
  if (state === 'running') {
    return {
      label: 'CI running',
      icon: <Loader2 className={`${ICON_CLASS} text-muted-foreground animate-spin`} aria-hidden />,
    }
  }
  return {
    label: 'CI passed',
    icon: <CheckCircle className={`${ICON_CLASS} text-green-500`} aria-hidden />,
  }
}
