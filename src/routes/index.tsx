import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/features/auth-status'
import { Board } from '~/features/board'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <AuthGate>
      <Board />
    </AuthGate>
  )
}
