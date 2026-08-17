import { db, getSetting, setSetting } from '../db'

export type DailyMetricType = 'water' | 'sleep' | 'calories'

interface MetricConfig {
  defaultGoal: number
  unit: string
  settingKey: string
  label: string
  // Quick-add increments shown as buttons in the edit sheet.
  // Empty array means the metric is "set exact value" only (e.g., sleep).
  quickAdds: number[]
  // Display formatter for the numeric value.
  format: (v: number) => string
}

export const METRIC_CONFIG: Record<DailyMetricType, MetricConfig> = {
  water: {
    // 16 US cups ≈ the old 3.785 L (a nominal gallon), so the migration
    // from L→cups doesn't change what a "goal met" day looks like.
    defaultGoal: 16,
    unit: 'cups',
    settingKey: 'goal_water_cups',
    label: 'Water',
    quickAdds: [1, 2, 4],
    format: (v) => (Number.isInteger(v) ? v.toString() : v.toFixed(1)),
  },
  sleep: {
    defaultGoal: 8,
    unit: 'h',
    settingKey: 'goal_sleep_h',
    label: 'Sleep',
    quickAdds: [],
    format: (v) => (Number.isInteger(v) ? v.toString() : v.toFixed(1)),
  },
  calories: {
    defaultGoal: 2200,
    unit: '',
    settingKey: 'goal_calories',
    label: 'Calories',
    quickAdds: [100, 250, 500],
    format: (v) => Math.round(v).toLocaleString(),
  },
}

export function startOfDay(d: Date | number): number {
  const dt = typeof d === 'number' ? new Date(d) : d
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
}

export function startOfToday(): number {
  return startOfDay(new Date())
}

// DST-safe walk to the previous calendar day.
export function previousDayStart(dayStart: number): number {
  const d = new Date(dayStart)
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Start of the current week, Monday at 00:00 local. Used to scope weekly
// resets — e.g., the Tasks list on the Today screen.
export function startOfWeek(d: Date = new Date()): number {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayOfWeek = result.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  result.setDate(result.getDate() - daysBack)
  result.setHours(0, 0, 0, 0)
  return result.getTime()
}

export async function getDailyValue(
  type: DailyMetricType,
  dayStart: number = startOfToday(),
): Promise<number> {
  const log = await db.health_logs
    .where('[date+type]')
    .equals([dayStart, type])
    .first()
  return log?.value ?? 0
}

export async function setDailyValue(
  type: DailyMetricType,
  value: number,
  dayStart: number = startOfToday(),
): Promise<void> {
  const v = Math.max(0, value)
  const existing = await db.health_logs
    .where('[date+type]')
    .equals([dayStart, type])
    .first()
  const unit = METRIC_CONFIG[type].unit
  if (existing) {
    await db.health_logs.update(existing.id!, { value: v })
  } else {
    await db.health_logs.add({
      date: dayStart,
      type,
      value: v,
      unit,
      createdAt: Date.now(),
    })
  }
}

export async function addToDaily(
  type: DailyMetricType,
  delta: number,
  dayStart: number = startOfToday(),
): Promise<void> {
  const current = await getDailyValue(type, dayStart)
  await setDailyValue(type, current + delta, dayStart)
}

// Sleep-specific write. Takes full wall-clock timestamps for bedtime and
// wake, computes the derived duration (hours) as the row's `value` so any
// caller reading log.value keeps working unchanged, and stores both
// timestamps so the entry surface + future insights can access them.
export async function setSleepFromTimes(
  bedtimeMs: number,
  wakeMs: number,
  dayStart: number = startOfToday(),
): Promise<void> {
  if (wakeMs <= bedtimeMs) return // invalid range; ignore rather than write garbage
  const hours = (wakeMs - bedtimeMs) / 3_600_000
  const existing = await db.health_logs
    .where('[date+type]')
    .equals([dayStart, 'sleep'])
    .first()
  if (existing) {
    await db.health_logs.update(existing.id!, {
      value: hours,
      unit: 'h',
      bedtimeMs,
      wakeMs,
    })
  } else {
    await db.health_logs.add({
      date: dayStart,
      type: 'sleep',
      value: hours,
      unit: 'h',
      bedtimeMs,
      wakeMs,
      createdAt: Date.now(),
    })
  }
}

export async function getGoal(type: DailyMetricType): Promise<number> {
  const stored = await getSetting<number>(METRIC_CONFIG[type].settingKey)
  return stored ?? METRIC_CONFIG[type].defaultGoal
}

export async function setGoal(type: DailyMetricType, value: number): Promise<void> {
  await setSetting(METRIC_CONFIG[type].settingKey, value)
}

// Streak = consecutive days where value >= goal, walking backwards from today.
// Today counts if hit; otherwise the streak still reflects yesterday-and-back.
//
// Calories are special: they're derived from logged meal entries, not from
// health_logs. Other metrics (water, sleep) read from health_logs.
export async function computeStreak(
  type: DailyMetricType,
  lookbackDays = 365,
): Promise<number> {
  const goal = await getGoal(type)
  const today = startOfToday()
  const earliest = previousDayN(today, lookbackDays)
  const valueByDay = new Map<number, number>()

  if (type === 'calories') {
    const entries = await db.meal_entries
      .where('date')
      .between(earliest, today, true, true)
      .toArray()
    for (const e of entries) {
      valueByDay.set(e.date, (valueByDay.get(e.date) ?? 0) + e.macros.calories)
    }
  } else {
    const logs = await db.health_logs
      .where('type')
      .equals(type)
      .filter((l) => l.date >= earliest && l.date <= today)
      .toArray()
    for (const log of logs) valueByDay.set(log.date, log.value)
  }

  const hit = (dayStart: number) => (valueByDay.get(dayStart) ?? 0) >= goal

  let streak = 0
  if (hit(today)) streak++
  let cursor = today
  for (let i = 1; i < lookbackDays; i++) {
    cursor = previousDayStart(cursor)
    if (hit(cursor)) streak++
    else break
  }
  return streak
}

function previousDayN(today: number, n: number): number {
  let cursor = today
  for (let i = 0; i < n; i++) cursor = previousDayStart(cursor)
  return cursor
}
