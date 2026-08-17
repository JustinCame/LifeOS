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
}

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
  return parseIcs(text, source.label)
}

// Parse an .ics blob into CalEvent[]. Recurring events (identified by
// RRULE) are expanded into concrete occurrences within a bounded window
// so a weekly team standup shows up on every week within view rather
// than only on its DTSTART.
//
// Expansion window: 30 days back → 90 days forward from "now". That's
// well beyond Home's 7-day preview and gives insights headroom without
// generating tens of thousands of rows for far-future daily standups.
function parseIcs(ics: string, label?: string): CalEvent[] {
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
      })
    }
  }

  return out
}

function cryptoIshId(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
