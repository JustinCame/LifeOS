import { db } from '../db'
import type { DailyLog } from '../db/types'
import { startOfDay } from './habits'

// Fixed palette used by both the Today prompt and the Notes calendar. Colors
// are hardcoded hex (not tokens) so the tag dots read the same in every
// theme.
export interface DailyTag {
  key: string
  label: string
  color: string
}

export const DAILY_TAGS: DailyTag[] = [
  { key: 'work',    label: 'Work',    color: '#E01A22' },
  { key: 'study',   label: 'Study',   color: '#4F6BFF' },
  { key: 'move',    label: 'Move',    color: '#6FCF2F' },
  { key: 'friends', label: 'Friends', color: '#FF8A00' },
  { key: 'family',  label: 'Family',  color: '#9B5CFF' },
  { key: 'create',  label: 'Create',  color: '#14D1B4' },
  { key: 'play',    label: 'Play',    color: '#FF3FA4' },
  { key: 'slow',    label: 'Slow',    color: '#6E7A85' },
  { key: 'out',     label: 'Out',     color: '#4FC3E8' },
  { key: 'sick',    label: 'Sick',    color: '#7A5C8F' },
  { key: 'travel',  label: 'Travel',  color: '#D9C24A' },
  { key: 'upkeep',  label: 'Upkeep',  color: '#A8906B' },
]

export function tagByKey(key: string): DailyTag | undefined {
  return DAILY_TAGS.find((t) => t.key === key)
}

// One log per day. Upsert semantics — repeated writes for the same day
// overwrite text/tags but preserve createdAt.
export async function getDailyLog(
  date: number = startOfDay(),
): Promise<DailyLog | undefined> {
  return db.daily_logs.where('date').equals(startOfDay(date)).first()
}

export async function upsertDailyLog(
  text: string,
  tags: string[],
  date: number = startOfDay(),
): Promise<void> {
  const day = startOfDay(date)
  const now = Date.now()
  const existing = await db.daily_logs.where('date').equals(day).first()
  if (existing) {
    await db.daily_logs.update(existing.id!, {
      text,
      tags,
      updatedAt: now,
    })
  } else {
    await db.daily_logs.add({
      date: day,
      text,
      tags,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export async function deleteDailyLog(date: number): Promise<void> {
  await db.daily_logs.where('date').equals(startOfDay(date)).delete()
}

// Fetch logs whose day falls inside [start, end] (both inclusive).
export async function getDailyLogsInRange(
  start: number,
  end: number,
): Promise<DailyLog[]> {
  const s = startOfDay(start)
  const e = startOfDay(end)
  return db.daily_logs.where('date').between(s, e, true, true).toArray()
}
