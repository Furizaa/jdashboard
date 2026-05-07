import { createContext, useContext } from 'react'
import type { DashboardService } from './service'

export const DashboardCtx = createContext<DashboardService | null>(null)

export function useDashboardService(): DashboardService {
  const service = useContext(DashboardCtx)
  if (service === null) {
    throw new Error('useDashboardService called outside <DashboardProvider>')
  }
  return service
}
