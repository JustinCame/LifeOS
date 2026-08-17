// POST /api/queue-push
//
// Client-called from the passive-insight layer when a trigger produces
// content that should be delivered as a push (currently: morning_brief).
// Stores the payload in Vercel KV under `push:pending:<slot>`; the cron
// job in api/push.ts reads it out on its schedule and sends via web-push.
//
// Auth: shared secret. QUEUE_PUSH_SECRET env var must match the
// `Authorization: Bearer <secret>` header on the request. Prevents
// randoms from spamming the user's phone via the public URL.
//
// Body:
//   { title: string, body: string, url?: string, slot: string }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const SLOT_PREFIX = 'push:pending:'
// Only queue-slots known to the app. Anything else 400s so an attacker
// with the secret can't stuff arbitrary keys into KV.
const ALLOWED_SLOTS = new Set(['morning'])
// KV TTL — one queued push should be delivered by the next cron. If the
// cron doesn't fire (deploy issue, etc.) it self-expires rather than
// sitting stale for weeks.
const TTL_SEC = 60 * 60 * 24

export const config = { runtime: 'nodejs' }

interface QueueBody {
  title?: string
  body?: string
  url?: string
  slot?: string
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const expected = process.env.QUEUE_PUSH_SECRET
  if (!expected) {
    res.status(500).json({ error: 'server_secret_not_configured' })
    return
  }
  const auth = req.headers.authorization
  if (auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  let body: QueueBody
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as QueueBody
    } catch {
      res.status(400).json({ error: 'bad_json' })
      return
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as QueueBody
  } else {
    res.status(400).json({ error: 'bad_json' })
    return
  }

  const { title, body: text, url, slot } = body
  if (!title || !text || !slot) {
    res.status(400).json({ error: 'missing_fields' })
    return
  }
  if (!ALLOWED_SLOTS.has(slot)) {
    res.status(400).json({ error: 'unknown_slot' })
    return
  }

  const payload = {
    title,
    body: text,
    // Never put user content in URL query strings; keep this a static path.
    url: url ?? '/',
  }

  await kv.set(SLOT_PREFIX + slot, payload, { ex: TTL_SEC })
  res.status(200).json({ ok: true, slot })
}
