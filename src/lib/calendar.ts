import { authedFetch } from './google'

export interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  location?: string
  description?: string
  htmlLink?: string
  status?: string
  // Present when this event is an instance of a recurring series. The value
  // is the master event id; deleting that id deletes the whole series.
  recurringEventId?: string
}

interface RawEventTime {
  dateTime?: string
  date?: string
  timeZone?: string
}

interface RawEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  status?: string
  start?: RawEventTime
  end?: RawEventTime
  recurringEventId?: string
}

function parseTime(t: RawEventTime | undefined): { date: Date; allDay: boolean } {
  if (!t) return { date: new Date(NaN), allDay: false }
  if (t.dateTime) return { date: new Date(t.dateTime), allDay: false }
  if (t.date) return { date: new Date(t.date + 'T00:00:00'), allDay: true }
  return { date: new Date(NaN), allDay: false }
}

export async function listEventsForRange(
  start: Date,
  end: Date,
): Promise<CalEvent[]> {
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const res = await authedFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Calendar fetch failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { items?: RawEvent[] }
  const items = data.items ?? []
  return items
    .filter((e) => e.status !== 'cancelled')
    .map((e): CalEvent => {
      const s = parseTime(e.start)
      const en = parseTime(e.end)
      return {
        id: e.id,
        title: e.summary ?? '(no title)',
        start: s.date,
        end: en.date,
        allDay: s.allDay,
        location: e.location,
        description: e.description,
        htmlLink: e.htmlLink,
        status: e.status,
        recurringEventId: e.recurringEventId,
      }
    })
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

export async function listTomorrow(): Promise<CalEvent[]> {
  const now = new Date()
  const tomorrowStart = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const tomorrowEnd = startOfDay(new Date(now.getTime() + 48 * 60 * 60 * 1000))
  return listEventsForRange(tomorrowStart, tomorrowEnd)
}

// Events across the next `days` calendar days, starting tomorrow at 00:00.
// Used by Today's schedule section — "what's coming up this week?".
export async function listNextDays(days: number): Promise<CalEvent[]> {
  const now = new Date()
  const start = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const end = startOfDay(
    new Date(start.getTime() + days * 24 * 60 * 60 * 1000),
  )
  return listEventsForRange(start, end)
}

export async function listToday(): Promise<CalEvent[]> {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return listEventsForRange(todayStart, todayEnd)
}

export function formatEventTime(e: CalEvent): string {
  if (e.allDay) return 'all day'
  return e.start.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  })
}

export function isHappeningNow(e: CalEvent, at = new Date()): boolean {
  return at >= e.start && at < e.end
}

export interface NewEventInput {
  title: string
  start: Date
  end: Date
  allDay?: boolean
  // RRULE body without the "RRULE:" prefix, e.g. "FREQ=WEEKLY"
  recurrence?: string
  location?: string
  description?: string
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface UpdateEventInput {
  eventId: string
  title?: string
  start?: Date
  end?: Date
  allDay?: boolean
  recurrence?: string
  location?: string
  description?: string
}

export async function updateEvent(input: UpdateEventInput): Promise<CalEvent> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.summary = input.title
  if (input.location !== undefined) body.location = input.location
  if (input.description !== undefined) body.description = input.description
  if (input.start) {
    body.start = input.allDay
      ? { date: ymd(input.start) }
      : { dateTime: input.start.toISOString(), timeZone: tz }
  }
  if (input.end) {
    body.end = input.allDay
      ? { date: ymd(input.end) }
      : { dateTime: input.end.toISOString(), timeZone: tz }
  }
  if (input.recurrence) {
    const rrule = input.recurrence.startsWith('RRULE:')
      ? input.recurrence
      : `RRULE:${input.recurrence}`
    body.recurrence = [rrule]
  }

  const res = await authedFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Update event failed (${res.status}): ${text || res.statusText}`,
    )
  }
  const data = (await res.json()) as RawEvent
  const sParse = parseTime(data.start)
  const eParse = parseTime(data.end)
  return {
    id: data.id,
    title: data.summary ?? '(no title)',
    start: sParse.date,
    end: eParse.date,
    allDay: sParse.allDay,
    location: data.location,
    description: data.description,
    htmlLink: data.htmlLink,
    status: data.status,
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  const res = await authedFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  )
  // 404/410 = already gone, treat as success
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Delete event failed (${res.status}): ${text || res.statusText}`,
    )
  }
}

export async function createEvent(input: NewEventInput): Promise<CalEvent> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const startBlock = input.allDay
    ? { date: ymd(input.start) }
    : { dateTime: input.start.toISOString(), timeZone: tz }
  const endBlock = input.allDay
    ? { date: ymd(input.end) }
    : { dateTime: input.end.toISOString(), timeZone: tz }

  const body: Record<string, unknown> = {
    summary: input.title,
    start: startBlock,
    end: endBlock,
  }
  if (input.location) body.location = input.location
  if (input.description) body.description = input.description
  if (input.recurrence) {
    const rrule = input.recurrence.startsWith('RRULE:')
      ? input.recurrence
      : `RRULE:${input.recurrence}`
    body.recurrence = [rrule]
  }

  const res = await authedFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Create event failed (${res.status}): ${text || res.statusText}`,
    )
  }
  const data = (await res.json()) as RawEvent
  const sParse = parseTime(data.start)
  const eParse = parseTime(data.end)
  return {
    id: data.id,
    title: data.summary ?? '(no title)',
    start: sParse.date,
    end: eParse.date,
    allDay: sParse.allDay,
    location: data.location,
    description: data.description,
    htmlLink: data.htmlLink,
    status: data.status,
  }
}
