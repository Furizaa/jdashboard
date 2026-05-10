import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type LightboxOpenContextValue = {
  isOpen: boolean
  register: () => void
  unregister: () => void
}

const noopValue: LightboxOpenContextValue = {
  isOpen: false,
  register: () => {},
  unregister: () => {},
}

const LightboxOpenContext = createContext<LightboxOpenContextValue>(noopValue)

export function LightboxOpenProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)
  const register = useCallback(() => setCount((n) => n + 1), [])
  const unregister = useCallback(() => setCount((n) => Math.max(0, n - 1)), [])
  const value = useMemo(
    () => ({ isOpen: count > 0, register, unregister }),
    [count, register, unregister],
  )
  return <LightboxOpenContext.Provider value={value}>{children}</LightboxOpenContext.Provider>
}

export function useLightboxOpen(): boolean {
  return useContext(LightboxOpenContext).isOpen
}

export function useRegisterLightbox(open: boolean): void {
  const { register, unregister } = useContext(LightboxOpenContext)
  useEffect(() => {
    if (!open) return
    register()
    return () => unregister()
  }, [open, register, unregister])
}
