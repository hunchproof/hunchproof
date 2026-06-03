import { useEffect, useState } from 'react'

/**
 * Milliseconds remaining until `targetMs`, re-rendering once per second.
 * Returns null when there is no target (e.g. demo slate with no absolute lock time).
 */
export function useCountdown(targetMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (targetMs == null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [targetMs])

  return targetMs == null ? null : targetMs - now
}
