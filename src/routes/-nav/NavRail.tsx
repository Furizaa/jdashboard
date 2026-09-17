import { Link } from '@tanstack/react-router'
import { Eye, LayoutGrid } from 'lucide-react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

// The app shell's left-hand navigation between the two boards. Routes are the
// only place multiple contexts are wired together, so the switcher lives here
// rather than inside any context.
const ITEMS = [
  { to: '/', label: 'Board', icon: LayoutGrid, testId: testIds.navBoard },
  { to: '/watchlist', label: 'Watchlist', icon: Eye, testId: testIds.navWatchlist },
] as const

export function NavRail() {
  return (
    <nav
      data-testid={testIds.navRail}
      aria-label="Boards"
      className="bg-background border-border flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      {ITEMS.map(({ to, label, icon: Icon, testId }) => (
        <Link
          key={to}
          to={to}
          data-testid={testId}
          title={label}
          aria-label={label}
          activeOptions={{ exact: true }}
          className="group text-ink-tertiary hover:text-foreground hover:bg-surface-2 data-[status=active]:text-foreground data-[status=active]:bg-surface-2 flex h-10 w-10 flex-col items-center justify-center rounded-md transition-colors"
        >
          {({ isActive }) => (
            <>
              <Icon size={18} className={cn(isActive && 'text-foreground')} aria-hidden />
              <span className="sr-only">{label}</span>
            </>
          )}
        </Link>
      ))}
    </nav>
  )
}
