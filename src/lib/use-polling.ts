import { useEffect, useRef } from 'react'

export function usePolling(refetch: () => void, intervalMs: number) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const start = () => {
      stop()
      intervalId = setInterval(() => refetchRef.current(), intervalMs)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      start()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs])
}
