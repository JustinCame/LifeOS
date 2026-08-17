// iCal-based calendar reader.
//
// Google Calendar exposes a per-calendar "secret iCal URL" that returns
// a plaintext .ics feed. Unlike OAuth, this doesn't expire and doesn't
// depend on cookies — perfect for iOS PWAs where Google's silent-refresh
// keeps dying because of storage partitioning.
//
// Supports up to MAX_ICAL_SOURCES calendars — a personal calendar,
// school schedule, holidays, etc. Each is fetched in parallel, parsed,
// and merged into a single CalEvent[] shape identical to what
// calendar.ts's OAuth path returns.

// @ts-expect-error — ical.js ships no types
import ICAL from 'ical.js'
import { deleteSetting, getSetting } from '../db'
import type { CalEvent } from './calendar'

// New multi-URL setting. Value is an array of {label, url} objects.
export const ICAL_URLS_SETTING = 'ical_urls'
// Legacy single-URL setting from the pre-multi-URL implementation. Kept
// for read-side backward compat so anyone who already set up one URL
// doesn't have to re-paste it. First save from the new UI clears this.
const LEGACY_ICAL_URL_SETTING = 'ical_url'

export const MAX_ICAL_SOURCES = 5

const FETCH_TTL_MS = 15 * 60_000

export interface ICalSource {
  // Optional user-supplied label (e.g. "Personal", "SUNY").
  label?: string
  url: string
  // One of CALENDAR_COLORS[].hex, chosen by the user to distinguish
  // this calendar's events on Home. Undefined = default accent.
  color?: string
}

// Fixed palette shown as the three color pips per calendar row in
// ICalSetupSheet. Kept short (three options) so decisions are fast;
// three calendars sharing three colors reads well, and if you exceed
// three you can still repeat colors — the label prefix on event
// titles disambiguates.
export const CALENDAR_COLORS: readonly { key: string; hex: string }[] = [
  { key: 'green', hex: '#6FCF2F' },
  { key: 'blue', hex: '#4A9EFF' },
  { key: 'red', hex: '#FF6B4A' },
]

interface CacheEntry {
  fetchedAt: number
  // Parsed but not yet range-filtered. Different range queries share
  // the same cache.
  events: CalEvent[]
}

// Per-URL cache — updating one calendar's URL doesn't invalidate the
// others. Keyed by URL string.
const cache = new Map<string, CacheEntry>()

// Read the configured iCal sources, prefer the new array setting, fall
// back to the legacy single-URL setting so a returning user with only
// the old one still works.
export async function getICalSources(): Promise<ICalSource[]> {
  const stored = await getSetting<unknown>(ICAL_URLS_SETTING)
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .filter(
        (s): s is ICalSource =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as { url?: unknown }).url === 'string' &&
          (s as { url: string }).url.trim().length > 0,
      )
      .map((s) => ({
        url: s.url.trim(),
        label: typeof s.label === 'string' && s.label.trim().length > 0
          ? s.label.trim()
          : undefined,
        color:
          typeof (s as { color?: unknown }).color === 'string' &&
          (s as { color: string }).color.trim().length > 0
            ? (s as { color: string }).color.trim()
            : undefined,
      }))
      .slice(0, MAX_ICAL_SOURCES)
  }
  // Fallback to legacy single-URL setting.
  const legacy = await getSetting<string>(LEGACY_ICAL_URL_SETTING)
  if (legacy && legacy.trim()) {
    return [{ url: legacy.trim() }]
  }
  return []
}

// Wall-clock check to see whether the iCal path should be used.
// calendar.ts calls this before deciding whether to hit the OAuth path.
export async function isICalConfigured(): Promise<boolean> {
  const sources = await getICalSources()
  return sources.length > 0
}

// Clear the legacy setting after the user saves through the new list-
// based UI so we don't have two potentially-conflicting sources of
// truth on the same device.
export async function clearLegacyICalSetting(): Promise<void> {
  await deleteSetting(LEGACY_ICAL_URL_SETTING)
}

// Filter cached events into the requested [start, end) window. Recurring
// events have already been expanded by parseIcs, so this is a straight
// date compare.
export async function listICalEventsForRange(
  start: Date,
  end: Date,
): Promise<CalEvent[]> {
  const sources = await getICalSources()
  if (sources.length === 0) throw new Error('no_ical_url')

  const now = Date.now()

  // Fetch anything that isn't already warm in the cache. Runs in
  // parallel so a school calendar being slow doesn't block a personal
  // one.
  await Promise.all(
    sources.map(async (source) => {
      const existing = cache.get(source.url)
      if (existing && now - existing.fetchedAt < FETCH_TTL_MS) return
      try {
        const events = await fetchAndParse(source)
        cache.set(source.url, { fetchedAt: now, events })
      } catch (err) {
        // Log but don't throw — one broken calendar shouldn't sink
        // everything. The remaining sources still contribute.
        console.warn(
          `[calendar] iCal fetch failed for ${source.label ?? source.url}:`,
          err,
        )
        // Keep the last successful cache if any; else stamp an empty
        // entry so we don't retry on every render.
        if (!existing) {
          cache.set(source.url, { fetchedAt: now, events: [] })
        }
      }
    }),
  )

  // Merge and filter to range across all configured calendars.
  const startMs = start.getTime()
  const endMs = end.getTime()
  const merged: CalEvent[] = []
  for (const source of sources) {
    const entry = cache.get(source.url)
    if (!entry) continue
    for (const e of entry.events) {
      if (e.end.getTime() > startMs && e.start.getTime() < endMs) {
        merged.push(e)
      }
    }
  }
  merged.sort((a, b) => a.start.getTime() - b.start.getTime())
  return merged
}

// Explicitly bust the cache — used after the user saves a new URL list.
export function invalidateICalCache(): void {
  cache.clear()
}

async function fetchAndParse(source: ICalSource): Promise<CalEvent[]> {
  const proxy = `/api/ical?url=${encodeURIComponent(source.url)}`
  const res = await fetch(proxy)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`iCal proxy failed (${res.status}): ${body}`)
  }
  const text = await res.text()
  return parseIcs(text, source.label, source.color)
}

// Parse an .ics blob into CalEvent[]. Recurring events (identified by
// RRULE) are expanded into concrete occurrences within a bounded window
// so a weekly team standup shows up on every week within view rather
// than only on its DTSTART.
//
// Expansion window: 30 days back → 90 days forward from "now". That's
// well beyond Home's 7-day preview and gives insights headroom without
// generating tens of thousands of rows for far-future daily standups.
function parseIcs(ics: string, label?: string, color?: string): CalEvent[] {
  const jcal = ICAL.parse(ics)
  const root = new ICAL.Component(jcal)
  const rawEvents = root.getAllSubcomponents('vevent')

  const winStartMs = Date.now() - 30 * 86_400_000
  const winEndMs = Date.now() + 90 * 86_400_000

  const out: CalEvent[] = []
  for (const raw of rawEvents) {
    const evt = new ICAL.Event(raw)
    if (raw.getFirstPropertyValue('status') === 'CANCELLED') continue

    const rawTitle = String(evt.summary ?? '(no title)')
    // Prefix the title with the calendar label so events from different
    // calendars are visually distinguishable on Home. If no label was
    // set, skip the prefix so nothing looks off.
    const summary = label ? `[${label}] ${rawTitle}` : rawTitle
    const location = raw.getFirstPropertyValue('location')
    const description = raw.getFirstPropertyValue('description')
    const uid = String(evt.uid ?? cryptoIshId())
    // Namespace the id by URL/label so events from different calendars
    // with the same UID (unlikely but possible) don't collide as React
    // keys downstream.
    const sourceKey = label ?? 'src'

    if (evt.isRecurring()) {
      const iter = evt.iterator()
      let next: ICAL.Time | null
      let safetyCounter = 0
      while ((next = iter.next()) && safetyCounter < 400) {
        safetyCounter++
        const occStart = next.toJSDate()
        if (occStart.getTime() > winEndMs) break
        if (occStart.getTime() < winStartMs) continue

        const details = evt.getOccurrenceDetails(next)
        out.push({
          id: `${sourceKey}::${uid}::${occStart.toISOString()}`,
          title: summary,
          start: details.startDate.toJSDate(),
          end: details.endDate.toJSDate(),
          allDay: details.startDate.isDate,
          location: location ? String(location) : undefined,
          description: description ? String(description) : undefined,
          recurringEventId: uid,
          color,
        })
      }
    } else {
      const startDate = evt.startDate?.toJSDate()
      const endDate = evt.endDate?.toJSDate()
      if (!startDate || !endDate) continue
      if (endDate.getTime() < winStartMs) continue
      if (startDate.getTime() > winEndMs) continue
      out.push({
        id: `${sourceKey}::${uid}`,
        title: summary,
        start: startDate,
        end: endDate,
        allDay: evt.startDate?.isDate ?? false,
        location: location ? String(location) : undefined,
        description: description ? String(description) : undefined,
        color,
      })
    }
  }

  return out
}

// Coerce whatever the user pasted into a canonical Google Calendar iCal
// URL, if we can. Handles:
//   1. `webcal://…` schemes (mobile OS "Add to Calendar" links)
//   2. Existing `.ics` URLs (private or public) — passed through
//   3. Public embed URLs like `https://calendar.google.com/calendar/embed?src=…`
//   4. Full <iframe …> embed code copied from Calendar settings
//   5. Older `?cid=<base64>` sharing links
//   6. Bare calendar IDs (looks like an email)
// Returns null if we can't recognize anything.
export function normalizeToICalUrl(input: string): string | null {
  let s = input.trim()
  if (!s) return null

  // (1) webcal:// → https://. Same content, different scheme.
  if (/^webcal:\/\//i.test(s)) {
    s = 'https://' + s.slice(9)
  }

  // (4) Extract src from an <iframe> embed block if the user pasted the
  // whole HTML snippet.
  const iframeMatch = s.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (iframeMatch) s = iframeMatch[1]
  // Iframe copies often use &amp;; decode so URL parsing works.
  s = s.replace(/&amp;/g, '&')

  // (2) Already an .ics URL in the shape we expect? Pass through.
  if (
    /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/]+\/(?:private-[a-z0-9]+|public)\/(?:basic|full)\.ics$/i.test(
      s,
    )
  ) {
    return s
  }

  // (3, 5) Google Calendar URL — try to extract a calendar id from
  // known query-param shapes.
  try {
    const url = new URL(s)
    if (url.hostname === 'calendar.google.com') {
      // /calendar/embed?src=<id>
      const src = url.searchParams.get('src')
      if (src) return publicIcsFor(src)
      // /calendar/u/0?cid=<base64 id>
      const cid = url.searchParams.get('cid')
      if (cid) {
        try {
          const decoded = atob(cid)
          if (decoded) return publicIcsFor(decoded)
        } catch {
          // not base64 — fall through
        }
      }
    }
  } catch {
    // not a URL — could still be a bare id below
  }

  // (6) Bare calendar id — Google's ids are email-like (either a Gmail
  // address for personal calendars or a group id for shared ones).
  // Loose check: contains @ and at least one dot, no whitespace, no
  // slashes, no leading scheme.
  if (
    /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s) &&
    !/^https?:/i.test(s)
  ) {
    return publicIcsFor(s)
  }

  return null
}

function publicIcsFor(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    calendarId,
  )}/public/basic.ics`
}

function cryptoIshId(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
