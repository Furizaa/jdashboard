import { createFileRoute } from '@tanstack/react-router'
import { AuthStatus } from '~/features/auth-status'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <AuthStatus />
}
