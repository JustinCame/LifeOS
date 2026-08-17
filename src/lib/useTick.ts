import { useEffect, useState } from 'react'

// Wall-clock tick hook. Returns `Date.now()`, updated every `intervalMs`
// while the tab is visible AND immediately when the tab returns to the
// foreground.
//
// Fixes the classic PWA background-suspend bug on iOS: setInterval stops
// firing when the app is backgrounded, so any countdown or elapsed
// display driven by a decrementing counter freezes. The fix — used by
// every timer in fitness — is to store the target/start timestamp and
// derive the display from Date.now(). This hook ensures a re-render on
// resume so the display catches up instantly instead of waiting up to
// intervalMs for the next tick.
export function useTick(intervalMs: number = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, intervalMs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}
