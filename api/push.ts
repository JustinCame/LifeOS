// GET /api/push?type=habits
//
// Cron-callable endpoint. Reads the stored push subscription from KV and
// sends a notification via web-push. Vercel Cron hits this on the schedule
// defined in vercel.json.
//
// Auth: if CRON_SECRET env var is set, requires `Authorization: Bearer <secret>`.
// Vercel Cron sends this header automatically when CRON_SECRET is configured.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import webpush, { type PushSubscription } from 'web-push'

const KEY = 'push:subscription'
const INSIGHT_SLOT_PREFIX = 'push:pending:'
// Slots the insight branch will read from. Keep in sync with the ALLOWED_SLOTS
// list in api/queue-push.ts; a cron that hits an unknown slot silently sends
// nothing rather than falling back.
const ALLOWED_INSIGHT_SLOTS = new Set(['morning'])

export const config = { runtime: 'nodejs' }

interface InsightPayload {
  title: string
  body: string
  url: string
}

const MESSAGES: Record<
  string,
  { title: string; body: string; url: string }
> = {
  habits: {
    title: 'Habit check-in',
    body: "Have you checked off today's habits?",
    url: '/',
  },
  tracking: {
    title: 'Track Weight, Sleep',
    body: "Have you logged today's weight and sleep?",
    url: '/',
  },
  backup: {
    title: 'Weekly backup',
    body: 'Sunday backup time — open Settings → Backup & restore.',
    url: '/',
  },
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).send('Unauthorized')
      return
    }
  }

  const typeParam = req.query.type
  const type =
    (Array.isArray(typeParam) ? typeParam[0] : typeParam) ?? 'habits'

  // Insight branch: read whatever the app queued to the given slot. If the
  // slot is empty, send NOTHING — per spec, this is silence, not a fallback
  // nag. The generic MESSAGES paths keep firing on their own crons if the
  // user wants a reminder.
  let message: { title: string; body: string; url: string }
  if (type === 'insight') {
    const slotParam = req.query.slot
    const slot =
      (Array.isArray(slotParam) ? slotParam[0] : slotParam) ?? 'morning'
    if (!ALLOWED_INSIGHT_SLOTS.has(slot)) {
      res.status(400).json({ ok: false, reason: 'unknown_slot' })
      return
    }
    const key = INSIGHT_SLOT_PREFIX + slot
    const pending = (await kv.get(key)) as InsightPayload | null
    if (!pending) {
      // No insight queued — do nothing at all.
      res.status(200).json({ ok: true, reason: 'no_pending' })
      return
    }
    message = pending
    // Consume the payload so we don't double-send if the cron re-fires.
    await kv.del(key)
  } else {
    message = MESSAGES[type] ?? MESSAGES.habits
  }

  const subscription = (await kv.get(KEY)) as PushSubscription | null
  if (!subscription) {
    res.status(200).json({ ok: false, reason: 'no_subscription' })
    return
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT_EMAIL ?? 'mailto:noreply@lifeos.app'

  if (!publicKey || !privateKey) {
    res.status(500).json({ ok: false, reason: 'missing_vapid_env' })
    return
  }

  webpush.setVapidDetails(contact, publicKey, privateKey)

  try {
    await webpush.sendNotification(subscription, JSON.stringify(message))
    res.status(200).json({ ok: true, type })
  } catch (err: unknown) {
    const status =
      typeof err === 'object' && err && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : 0
    if (status === 404 || status === 410) {
      await kv.del(KEY)
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status,
    })
  }
}
