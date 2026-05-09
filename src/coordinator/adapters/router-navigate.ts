import type { useNavigate } from '@tanstack/react-router'
import type { Navigate } from '../ports'

type RouterNavigate = ReturnType<typeof useNavigate>

export function createRouterNavigateAdapter(navigate: RouterNavigate): Navigate {
  return {
    toIssue: (key) => {
      navigate({ to: '/', search: { issue: key } })
    },
    clearIssue: () => {
      navigate({ to: '/', search: {} })
    },
  }
}
