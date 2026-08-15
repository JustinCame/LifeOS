import { db } from '../db'
import type { Habit } from '../db/types'
import { getGoal } from './health'
import { startOfDay } from './habits'

// Mirror external data (water/sleep goals hit; workout completed) into
// habit_entries for any habit that opted into a linkedMetric. Called
// whenever the source data changes so the habit rings on Today reflect
// reality without the user having to toggle anything manually.
export async function syncAllLinkedHabits(): Promise<void> {
  const habits = await db.habits.toArray()
  const linked = habits.filter(
    (h) => h.linkedMetric && !h.archivedAt,
  )
  if (linked.length === 0) return

  const today = startOfDay()
  const [waterLog, sleepLog, waterGoal, sleepGoal, todayWorkouts] =
    await Promise.all([
      db.health_logs.where('[date+type]').equals([today, 'water']).first(),
      db.health_logs.where('[date+type]').equals([today, 'sleep']).first(),
      getGoal('water'),
      getGoal('sleep'),
      db.workouts.where('date').aboveOrEqual(today).toArray(),
    ])

  const workoutDoneToday = todayWorkouts.some(
    (w) => w.completedAt !== undefined && w.completedAt >= today,
  )

  for (const habit of linked) {
    const shouldBeDone = isLinkedHabitDone(habit, {
      waterValue: waterLog?.value ?? 0,
      sleepValue: sleepLog?.value ?? 0,
      waterGoal,
      sleepGoal,
      workoutDoneToday,
    })
    await upsertLinkedEntry(habit, shouldBeDone, today)
  }
}

interface Snapshot {
  waterValue: number
  sleepValue: number
  waterGoal: number
  sleepGoal: number
  workoutDoneToday: boolean
}

function isLinkedHabitDone(habit: Habit, snap: Snapshot): boolean {
  switch (habit.linkedMetric) {
    case 'water':
      return snap.waterGoal > 0 && snap.waterValue >= snap.waterGoal
    case 'sleep':
      return snap.sleepGoal > 0 && snap.sleepValue >= snap.sleepGoal
    case 'workout':
      return snap.workoutDoneToday
    default:
      return false
  }
}

// Upsert today's entry for a linked habit, then re-derive streak/longest.
// Skips the recompute if nothing changed to avoid loops in the useEffect
// that calls this from App.tsx.
async function upsertLinkedEntry(
  habit: Habit,
  done: boolean,
  date: number,
): Promise<void> {
  const existing = await db.habit_entries
    .where('[habitId+date]')
    .equals([habit.id!, date])
    .first()
  const currentValue = existing?.value ?? 0
  const target = 1
  const nextValue = done ? 1 : 0
  if (currentValue === nextValue) return

  if (existing) {
    await db.habit_entries.update(existing.id!, { value: nextValue, target })
  } else if (nextValue === 1) {
    await db.habit_entries.add({
      habitId: habit.id!,
      date,
      value: 1,
      target,
      createdAt: Date.now(),
    })
  }
  // No else — don't create a value=0 entry for a linked habit that was
  // never done today. Keeps the entries table quiet.

  // Recompute persisted streak/longest without importing the helper (avoids
  // a circular import). Duplicate a minimal walk-back here.
  const entries = await db.habit_entries
    .where('habitId')
    .equals(habit.id!)
    .toArray()
  const { streak, longest } = await import('./habits').then((m) => ({
    streak: m.computeStreak(habit, entries),
    longest: Math.max(
      m.computeLongestStreak(habit, entries),
      m.computeStreak(habit, entries),
    ),
  }))
  await db.habits.update(habit.id!, { streak, longestStreak: longest })
}
