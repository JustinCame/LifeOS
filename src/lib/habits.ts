import { db } from '../db'
import type { Habit, HabitEntry, HabitKind, HabitSchedule } from '../db/types'

/* -------------------- Date helpers -------------------- */

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DAY_MS = 86_400_000

// ISO week start (Monday) at 00:00 for the timestamp's local week.
// perWeek habits key their "this week" bucket off this.
function startOfIsoWeek(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=Sun … 6=Sat
  const daysFromMonday = (dow + 6) % 7
  d.setDate(d.getDate() - daysFromMonday)
  return d.getTime()
}

/* -------------------- Derived values -------------------- */

// 0..1. Binary/avoid coerce to done/not; count/duration divide by target.
// Avoid habits are inverted: value=0 means kept (progress 1); value>=1 means
// broken (progress 0). "No entry" is treated as kept when computed from the
// habit alone below in progressForDay.
export function progressOf(habit: Habit, entry: HabitEntry | undefined): number {
  if (habit.kind === 'avoid') {
    if (!entry) return 1
    return entry.value >= 1 ? 0 : 1
  }
  if (!entry) return 0
  if (habit.kind === 'binary') return entry.value >= 1 ? 1 : 0
  const target = entry.target > 0 ? entry.target : habit.target ?? 1
  if (target <= 0) return entry.value > 0 ? 1 : 0
  return Math.max(0, Math.min(1, entry.value / target))
}

export function isScheduledOn(habit: Habit, ts: number): boolean {
  const s = habit.schedule
  if (s.mode === 'daily') return true
  if (s.mode === 'weekdays') return s.days.includes(new Date(ts).getDay())
  // perWeek: every day is a candidate; hit is evaluated at the week level.
  return true
}

export function isScheduledToday(habit: Habit): boolean {
  return isScheduledOn(habit, Date.now())
}

// Human labels for the header meta lines and habit cards.
export function scheduleLabel(habit: Habit): string {
  const s = habit.schedule
  if (s.mode === 'daily') return 'every day'
  if (s.mode === 'perWeek') return `${s.perWeek}× per week`
  const short = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return s.days
    .slice()
    .sort()
    .map((d) => short[d])
    .join(' ')
}

export function targetLabel(habit: Habit): string {
  if (habit.kind === 'binary') return 'done or not'
  if (habit.kind === 'avoid') return 'avoid'
  const t = habit.target ?? 0
  const u = habit.unit?.trim()
  return u ? `${t} ${u}` : `${t}`
}

export function kindLabel(kind: HabitKind): string {
  switch (kind) {
    case 'binary':
      return 'Yes / no'
    case 'count':
      return 'Count'
    case 'duration':
      return 'Duration'
    case 'avoid':
      return 'Avoidance'
  }
}

/* -------------------- Streak / consistency -------------------- */

// Group entries by day for O(1) lookup during walks.
function entriesByDay(entries: HabitEntry[]): Map<number, HabitEntry> {
  const m = new Map<number, HabitEntry>()
  for (const e of entries) m.set(startOfDay(e.date), e)
  return m
}

function entriesByWeek(entries: HabitEntry[]): Map<number, HabitEntry[]> {
  const m = new Map<number, HabitEntry[]>()
  for (const e of entries) {
    const wk = startOfIsoWeek(e.date)
    const arr = m.get(wk) ?? []
    arr.push(e)
    m.set(wk, arr)
  }
  return m
}

// Consecutive scheduled days walking back from today where progress >= 1.
// Rest days (not scheduled) are skipped without breaking the streak.
// perWeek habits count consecutive ISO weeks in which perWeek entries exist.
export function computeStreak(habit: Habit, entries: HabitEntry[]): number {
  if (habit.schedule.mode === 'perWeek') {
    const need = habit.schedule.perWeek
    const byWeek = entriesByWeek(entries)
    let count = 0
    let wk = startOfIsoWeek(Date.now())
    // Cap the walk so a totally empty history doesn't spin forever.
    for (let i = 0; i < 520; i++) {
      const hits = (byWeek.get(wk) ?? []).filter((e) => progressOf(habit, e) >= 1)
      // Only require hitting the count; date order within a week doesn't matter.
      if (hits.length >= need) {
        count++
        wk -= 7 * DAY_MS
      } else {
        break
      }
    }
    return count
  }

  const byDay = entriesByDay(entries)
  let count = 0
  let day = startOfDay()
  for (let i = 0; i < 365 * 5; i++) {
    if (!isScheduledOn(habit, day)) {
      day -= DAY_MS
      continue
    }
    const e = byDay.get(day)
    if (progressOf(habit, e) >= 1) {
      count++
      day -= DAY_MS
    } else {
      // For avoid habits, only an entry with value>=1 breaks. No entry = kept
      // = should have already returned progress 1 → this branch means broken.
      break
    }
  }
  return count
}

// Hit rate (%) over the last `days` scheduled days. perWeek counts by week
// windows instead of days to avoid double-counting.
export function consistency(
  habit: Habit,
  entries: HabitEntry[],
  days = 30,
): number {
  if (habit.schedule.mode === 'perWeek') {
    const need = habit.schedule.perWeek
    const weeks = Math.max(1, Math.round(days / 7))
    const byWeek = entriesByWeek(entries)
    let hit = 0
    let wk = startOfIsoWeek(Date.now())
    for (let i = 0; i < weeks; i++) {
      const hits = (byWeek.get(wk) ?? []).filter((e) => progressOf(habit, e) >= 1)
      if (hits.length >= need) hit++
      wk -= 7 * DAY_MS
    }
    return Math.round((hit / weeks) * 100)
  }

  const byDay = entriesByDay(entries)
  let hit = 0
  let scheduled = 0
  let day = startOfDay()
  for (let i = 0; i < days; i++) {
    if (isScheduledOn(habit, day)) {
      scheduled++
      const e = byDay.get(day)
      if (progressOf(habit, e) >= 1) hit++
    }
    day -= DAY_MS
  }
  if (scheduled === 0) return 0
  return Math.round((hit / scheduled) * 100)
}

// Hit/scheduled tuple for the header line ("3/5 today", "12/20 this month").
export function scheduledHitCounts(
  habit: Habit,
  entries: HabitEntry[],
  days: number,
): { hit: number; scheduled: number } {
  if (habit.schedule.mode === 'perWeek') {
    const need = habit.schedule.perWeek
    const weeks = Math.max(1, Math.round(days / 7))
    const byWeek = entriesByWeek(entries)
    let hit = 0
    let scheduled = 0
    let wk = startOfIsoWeek(Date.now())
    for (let i = 0; i < weeks; i++) {
      scheduled += need
      hit += Math.min(
        need,
        (byWeek.get(wk) ?? []).filter((e) => progressOf(habit, e) >= 1).length,
      )
      wk -= 7 * DAY_MS
    }
    return { hit, scheduled }
  }
  const byDay = entriesByDay(entries)
  let hit = 0
  let scheduled = 0
  let day = startOfDay()
  for (let i = 0; i < days; i++) {
    if (isScheduledOn(habit, day)) {
      scheduled++
      const e = byDay.get(day)
      if (progressOf(habit, e) >= 1) hit++
    }
    day -= DAY_MS
  }
  return { hit, scheduled }
}

// The entry for today (or undefined). Callers use this + progressOf to render
// the current ring value.
export function entryForToday(entries: HabitEntry[]): HabitEntry | undefined {
  const today = startOfDay()
  return entries.find((e) => startOfDay(e.date) === today)
}

/* -------------------- CRUD -------------------- */

export type NewHabit = Omit<
  Habit,
  'id' | 'createdAt' | 'streak' | 'longestStreak' | 'archivedAt'
>

export async function addHabit(input: NewHabit): Promise<number> {
  const id = await db.habits.add({
    ...input,
    streak: 0,
    longestStreak: 0,
    createdAt: Date.now(),
  })
  return id as number
}

export async function updateHabit(
  id: number,
  updates: Partial<Habit>,
): Promise<void> {
  await db.habits.update(id, updates)
}

export async function archiveHabit(id: number): Promise<void> {
  await db.habits.update(id, { archivedAt: Date.now() })
}

export async function unarchiveHabit(id: number): Promise<void> {
  await db.habits.update(id, { archivedAt: undefined })
}

// Wipes the habit AND its history — used by the "Delete habit and history"
// action in the danger zone. Archiving is the softer default.
export async function deleteHabit(id: number): Promise<void> {
  await db.transaction('rw', db.habits, db.habit_entries, async () => {
    await db.habit_entries.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  })
}

// Upsert today's entry. Value semantics vary by kind — the caller decides
// (binary: 0/1 toggle; count/duration: absolute; avoid: 0 kept or 1 broken).
export async function setHabitValue(
  habit: Habit,
  value: number,
  date: number = startOfDay(),
): Promise<void> {
  const target =
    habit.kind === 'binary' || habit.kind === 'avoid'
      ? 1
      : habit.target ?? 1
  const existing = await db.habit_entries
    .where('[habitId+date]')
    .equals([habit.id!, date])
    .first()
  if (existing) {
    await db.habit_entries.update(existing.id!, { value, target })
  } else {
    await db.habit_entries.add({
      habitId: habit.id!,
      date,
      value,
      target,
      createdAt: Date.now(),
    })
  }
  await recomputeStreaks(habit)
}

// Attach or update a note for today's entry. Creates an entry with value 0
// if none exists yet so the note has somewhere to live.
export async function setHabitNote(
  habit: Habit,
  note: string,
  date: number = startOfDay(),
): Promise<void> {
  const existing = await db.habit_entries
    .where('[habitId+date]')
    .equals([habit.id!, date])
    .first()
  if (existing) {
    await db.habit_entries.update(existing.id!, {
      note: note.trim() || undefined,
    })
  } else {
    const target =
      habit.kind === 'binary' || habit.kind === 'avoid'
        ? 1
        : habit.target ?? 1
    await db.habit_entries.add({
      habitId: habit.id!,
      date,
      value: 0,
      target,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    })
  }
}

// Recompute streak + longestStreak from the entry history and persist. Called
// after any value change so we don't need to derive on read.
async function recomputeStreaks(habit: Habit): Promise<void> {
  const entries = await db.habit_entries
    .where('habitId')
    .equals(habit.id!)
    .toArray()
  const streak = computeStreak(habit, entries)
  const longest = Math.max(habit.longestStreak ?? 0, streak)
  await db.habits.update(habit.id!, {
    streak,
    longestStreak: longest,
  })
}

/* -------------------- Convenience for schedule shapes -------------------- */

export function defaultScheduleFor(mode: HabitSchedule['mode']): HabitSchedule {
  if (mode === 'daily') return { mode: 'daily' }
  if (mode === 'weekdays') return { mode: 'weekdays', days: [1, 2, 3, 4, 5] }
  return { mode: 'perWeek', perWeek: 3 }
}
