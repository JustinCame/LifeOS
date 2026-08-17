// Client-side helper for queueing a push to be delivered by the next cron.
//
// The passive-insight layer calls this after inserting an insight whose
// trigger declares a `pushSlot`. The POST hits /api/queue-push, which
// stores the payload in Vercel KV; /api/push then reads it out on the
// cron schedule for that slot.
//
// Auth: shared secret. Set QUEUE_PUSH_SECRET on Vercel; paste the same
// value into the app's settings under key `queue_push_secret`. Without
// the secret set on the client, this silently no-ops — same graceful
// skip as the no-API-key case in generate.ts.

import { getSetting } from '../../db'

export const QUEUE_PUSH_SECRET_SETTING = 'queue_push_secret'

interface QueueArgs {
  slot: 'morning'
  title: string
  body: string
  url?: string
}

export async function queuePush(args: QueueArgs): Promise<void> {
  // In dev (Vite server), /api routes aren't served. Skip cleanly rather
  // than logging a 404 every scheduled run.
  if (!import.meta.env.PROD) {
    console.info('[insights] queuePush skipped in dev', args.slot)
    return
  }

  const secret = await getSetting<string>(QUEUE_PUSH_SECRET_SETTING)
  if (!secret || !secret.trim()) {
    console.info('[insights] queuePush skipped: no client secret set')
    return
  }

  try {
    const resp = await fetch('/api/queue-push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret.trim()}`,
      },
      body: JSON.stringify({
        slot: args.slot,
        title: args.title,
        body: args.body,
        url: args.url ?? '/',
      }),
    })
    if (!resp.ok) {
      // Surface the reason once — don't retry. If the secret is wrong or
      // the endpoint isn't deployed yet, retries won't fix it.
      const text = await resp.text().catch(() => '')
      console.warn(`[insights] queuePush ${resp.status}: ${text}`)
    }
  } catch (err) {
    // Network error — passive layer must never break anything, so swallow.
    console.warn('[insights] queuePush failed:', err)
  }
}
