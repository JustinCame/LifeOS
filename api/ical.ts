// GET /api/ical?url=<encoded google calendar ical url>
//
// Server-side proxy for Google Calendar's "secret iCal URL" feature. The
// browser can't fetch these URLs directly — calendar.google.com doesn't
// send permissive CORS headers to a random origin — so we relay through
// a Vercel function.
//
// Auth model: none. The URL itself is Google's secret bearer token
// (leaking it means anyone with the URL can read the calendar, same as
// hitting calendar.google.com directly). Adding an app-level secret on
// top of that adds no real defensive value; a URL allowlist keeps this
// from becoming a general-purpose open proxy.

import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { runtime: 'nodejs' }

// The valid shapes of Google Calendar's iCal URLs. Both `basic.ics` (just
// event times) and `full.ics` (with attendees etc.) are supported;
// path also allows the `public` variant since some users use that for
// shared calendars.
const ICAL_URL_PATTERNS = [
  /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/]+\/(?:private-[a-z0-9]+|public)\/(?:basic|full)\.ics$/,
]

function isAllowed(url: string): boolean {
  try {
    // Reject anything that isn't a well-formed URL up front.
    new URL(url)
  } catch {
    return false
  }
  return ICAL_URL_PATTERNS.some((re) => re.test(url))
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const raw = req.query.url
  const url = Array.isArray(raw) ? raw[0] : raw
  if (!url || !isAllowed(url)) {
    res.status(400).json({ error: 'bad_url' })
    return
  }

  try {
    const upstream = await fetch(url, {
      // Google's iCal feed returns 200 + text/calendar. No caching layer
      // needed — Google itself already throttles the freshness and we
      // rate-limit on the client (see calendar.ts iCalCache).
      headers: { accept: 'text/calendar' },
    })
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: 'upstream_failed',
        status: upstream.status,
      })
      return
    }
    const text = await upstream.text()
    res.setHeader('content-type', 'text/calendar; charset=utf-8')
    // 5 minute cache on the edge — same freshness Google enforces on
    // their side. Prevents hammering the upstream on rapid open-close.
    res.setHeader('cache-control', 'public, max-age=300')
    res.status(200).send(text)
  } catch (err) {
    res.status(502).json({
      error: 'fetch_failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
