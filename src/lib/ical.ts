// iCal-based calendar reader.
//
// Google Calendar exposes a per-calendar "secret iCal URL" that returns
// a plaintext .ics feed. Unlike OAuth, this doesn't expire and doesn't
// depend on cookies — perfect for iOS PWAs where Google's silent-refresh
// keeps dying because of storage partitioning.
//
// Flow: client asks the Vercel proxy (api/ical.ts) for the raw feed;
// this file parses that with ical.js, expands recurring events into
// concrete occurrences, and returns CalEvent[] shaped identically to
// what calendar.ts's OAuth path returns. Downstream code doesn't need
// to know which source is live.
//
// Cache: 15 minutes in-memory. Google throttles freshness on their side
// (~1h lag typical) and hitting the proxy every render is wasteful.
// The cache is a plain module-level Map; PWA reloads clear it.

// @ts-expect-error — ical.js ships no types
import ICAL from 'ical.js'
import { getSetting } from '../db'
import type { CalEvent } from './calendar'

export const ICAL_URL_SETTING = 'ical_url'

const FETCH_TTL_MS = 15 * 60_000

interface CacheEntry {
  url: string
  fetchedAt: number
  // Parsed but not yet range-filtered. We store all events and filter
  // per-call so different range queries share the same cache.
  events: CalEvent[]
}

let cache: CacheEntry | null = null

export async function getICalUrl(): Promise<string | null> {
  const v = await getSetting<string>(ICAL_URL_SETTING)
  return v && v.trim() ? v.trim() : null
}

// Wall-clock check to see whether the iCal path is what we should use.
// Home / calendar helpers call this before deciding whether to hit the
// OAuth path.
export async function isICalConfigured(): Promise<boolean> {
  const url = await getICalUrl()
  return url !== null
}

// Filter cached events into the requested [start, end) window. Recurring
// events have already been expanded by parseIcalFeed, so this is a
// straightforward date compare.
export async function listICalEventsForRange(
  start: Date,
  end: Date,
): Promise<CalEvent[]> {
  const url = await getICalUrl()
  if (!url) throw new Error('no_ical_url')

  const now = Date.now()
  const useCache =
    cache !== null &&
    cache.url === url &&
    now - cache.fetchedAt < FETCH_TTL_MS

  if (!useCache) {
    const events = await fetchAndParse(url)
    cache = { url, fetchedAt: now, events }
  }

  const events = cache!.events
  const startMs = start.getTime()
  const endMs = end.getTime()
  return events
    .filter((e) => e.end.getTime() > startMs && e.start.getTime() < endMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

// Explicitly bust the cache — used after the user pastes a new URL or
// deliberately wants a live fetch.
export function invalidateICalCache(): void {
  cache = null
}

async function fetchAndParse(url: string): Promise<CalEvent[]> {
  const proxy = `/api/ical?url=${encodeURIComponent(url)}`
  const res = await fetch(proxy)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`iCal proxy failed (${res.status}): ${body}`)
  }
  const text = await res.text()
  return parseIcs(text)
}

// Parse an .ics blob into CalEvent[]. Recurring events (identified by
// RRULE) are expanded into concrete occurrences within a bounded window
// so a weekly team standup shows up on every week within view rather
// than only on its DTSTART.
//
// Expansion window: 30 days back → 90 days forward from "now". That's
// well beyond Home's 7-day preview and gives insights and any past-look
// features headroom without generating tens of thousands of rows for
// far-future daily standups.
function parseIcs(ics: string): CalEvent[] {
  // ical.js's parse returns a jCal array-of-arrays representation; the
  // Component wrapper lets us walk it in a more readable way.
  const jcal = ICAL.parse(ics)
  const root = new ICAL.Component(jcal)
  const rawEvents = root.getAllSubcomponents('vevent')

  const windowStart = new Date(Date.now() - 30 * 86_400_000)
  const windowEnd = new Date(Date.now() + 90 * 86_400_000)
  const winStartMs = windowStart.getTime()
  const winEndMs = windowEnd.getTime()

  const out: CalEvent[] = []
  for (const raw of rawEvents) {
    const evt = new ICAL.Event(raw)
    if (raw.getFirstPropertyValue('status') === 'CANCELLED') continue

    const summary = String(evt.summary ?? '(no title)')
    const location = raw.getFirstPropertyValue('location')
    const description = raw.getFirstPropertyValue('description')
    const uid = String(evt.uid ?? cryptoIshId())

    if (evt.isRecurring()) {
      // Expand recurring master into the window.
      const iter = evt.iterator()
      let next: ICAL.Time | null
      let safetyCounter = 0
      while ((next = iter.next()) && safetyCounter < 400) {
        safetyCounter++
        const occStart = next.toJSDate()
        if (occStart.getTime() > winEndMs) break
        // Skip anything before our window's start.
        if (occStart.getTime() < winStartMs) continue

        const details = evt.getOccurrenceDetails(next)
        out.push({
          id: `${uid}::${occStart.toISOString()}`,
          title: summary,
          start: details.startDate.toJSDate(),
          end: details.endDate.toJSDate(),
          allDay: details.startDate.isDate,
          location: location ? String(location) : undefined,
          description: description ? String(description) : undefined,
          recurringEventId: uid,
        })
      }
    } else {
      // Non-recurring event — take DTSTART/DTEND as-is.
      const startDate = evt.startDate?.toJSDate()
      const endDate = evt.endDate?.toJSDate()
      if (!startDate || !endDate) continue
      // Only skip if the whole event finishes before our window opens or
      // starts after it closes — otherwise let the per-call filter in
      // listICalEventsForRange narrow it down.
      if (endDate.getTime() < winStartMs) continue
      if (startDate.getTime() > winEndMs) continue
      out.push({
        id: uid,
        title: summary,
        start: startDate,
        end: endDate,
        allDay: evt.startDate?.isDate ?? false,
        location: location ? String(location) : undefined,
        description: description ? String(description) : undefined,
      })
    }
  }

  return out
}

// Fallback id when a VEVENT has no UID (shouldn't happen with Google
// but a defensive random beats a collision).
function cryptoIshId(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
