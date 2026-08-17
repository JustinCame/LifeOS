// Client helpers for scheduling / cancelling notifications inside the
// service worker.
//
// See public/sw.js `scheduledTimers` for why we schedule from the SW
// rather than the page (short version: iOS suspends the page's JS the
// moment the app is backgrounded; SW timers get a longer background
// window, so a scheduled rest-timer notification is much more likely to
// fire on time even if the phone is locked).
//
// Behavior when notification permission isn't granted or the SW isn't
// available: silent no-op. The existing foreground-fires-on-return path
// (via fireLocalNotification in the components) still runs as a fallback,
// so at worst the user sees the notification the moment they come back
// instead of at the exact time.

interface ScheduleArgs {
  // Stable id so subsequent schedules with the same id override the
  // pending timer (e.g. tapping ±30s on a rest timer reschedules).
  id: string
  title: string
  body: string
  // Wall-clock ms timestamp when the notification should fire.
  at: number
  // Optional notification tag; defaults to `lifeos-timer-<id>`.
  tag?: string
}

export function scheduleServiceWorkerNotification(args: ScheduleArgs): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => {
      const target = reg.active
      if (!target) return
      target.postMessage({
        type: 'schedule-notification',
        id: args.id,
        title: args.title,
        body: args.body,
        at: args.at,
        tag: args.tag,
      })
    })
    .catch(() => {
      /* SW not ready; foreground fire on return is our fallback */
    })
}

export function cancelServiceWorkerNotification(id: string): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => {
      const target = reg.active
      if (!target) return
      target.postMessage({ type: 'cancel-notification', id })
    })
    .catch(() => {
      /* nothing to cancel if the SW isn't reachable */
    })
}
