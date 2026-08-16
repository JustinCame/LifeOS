import type { Workout } from '../db/types'

// User's fixed weekly schedule. 5-day lifting split with cardio slotted
// around it. Days without a lift AND without cardio are pure rest.
//
//   Mon — Rest
//   Tue — Upper · Zone 2 after (30-40 min)
//   Wed — Lower
//   Thu — Rest · Zone 2 (30-40 min)
//   Fri — Push
//   Sat — Pull · HIIT after (15-20 min)
//   Sun — Legs

export type LiftKey = 'push' | 'pull' | 'legs' | 'upper' | 'lower'

export interface LiftDay {
  key: LiftKey
  dow: number // 0=Sun … 6=Sat
  name: string
  sub: string
  exercises: number
  min: number
  // Name of the Dexie WorkoutTemplate this lift should run. Matches the
  // existing PPLUL install so tapping Start runs the right template.
  templateName: string
}

export interface CardioSlot {
  key: 'liss' | 'hiit'
  name: string
  min: number
  detail: string
}

export const LIFTS: LiftDay[] = [
  { key: 'upper', dow: 2, name: 'Upper', sub: 'PPLUL · Upper', exercises: 7, min: 60, templateName: 'PPLUL · Upper' },
  { key: 'lower', dow: 3, name: 'Lower', sub: 'PPLUL · Lower', exercises: 7, min: 60, templateName: 'PPLUL · Lower' },
  { key: 'push',  dow: 5, name: 'Push',  sub: 'PPLUL · Push',  exercises: 7, min: 60, templateName: 'PPLUL · Push' },
  { key: 'pull',  dow: 6, name: 'Pull',  sub: 'PPLUL · Pull',  exercises: 6, min: 55, templateName: 'PPLUL · Pull' },
  { key: 'legs',  dow: 0, name: 'Legs',  sub: 'PPLUL · Legs',  exercises: 6, min: 55, templateName: 'PPLUL · Legs' },
]

// Cardio scheduled per day-of-week (0=Sun … 6=Sat). Undefined = none.
export const CARDIO_SCHEDULE: Record<number, CardioSlot | undefined> = {
  0: undefined,                                                      // Sun
  1: undefined,                                                      // Mon
  2: { key: 'liss', name: 'Zone 2', min: 40, detail: 'After lifting · 30-40 min' },
  3: undefined,                                                      // Wed
  4: { key: 'liss', name: 'Zone 2', min: 40, detail: 'Active recovery · 30-40 min' },
  5: undefined,                                                      // Fri
  6: { key: 'hiit', name: 'HIIT',   min: 20, detail: 'After lifting · 15-20 min' },
}

// Manual picker options when the user toggles cardio mode away from what's
// scheduled — same two kinds as the schedule, just labeled for the dial.
export const CARDIO_OPTS: CardioSlot[] = [
  { key: 'liss', name: 'Zone 2', min: 40, detail: 'Steady state · incline walk / bike' },
  { key: 'hiit', name: 'HIIT',   min: 20, detail: '90s intervals · bike sprints' },
]

export function liftForDow(dow: number): LiftDay | null {
  return LIFTS.find((l) => l.dow === dow) ?? null
}

export function todaysLift(now = new Date()): LiftDay | null {
  return liftForDow(now.getDay())
}

export function todaysCardio(now = new Date()): CardioSlot | null {
  return CARDIO_SCHEDULE[now.getDay()] ?? null
}

// Monday-anchored week start at 00:00 local.
export function startOfWeekMon(now = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const daysFromMonday = (dow + 6) % 7
  d.setDate(d.getDate() - daysFromMonday)
  return d.getTime()
}

export function workoutsThisWeek(workouts: Workout[]): number {
  const weekStart = startOfWeekMon()
  return workouts.filter(
    (w) => w.completedAt !== undefined && w.date >= weekStart,
  ).length
}

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
