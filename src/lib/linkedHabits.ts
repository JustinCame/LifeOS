import { db } from '../db'
import type { Habit } from '../db/types'
import { getGoal } from './health'
import { startOfDay } from './habits'

// Mirror external data into habit_entries for any habit that opted into a
// linkedMetric. For water/sleep, the entry's *value* matches the health
// log's value so a duration/count habit ring shows partial progress
// (5 cups out of 16 → 31% filled). For workouts, the link stays binary:
// 1 when a workout was completed today, 0 otherwise.
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
    let value = 0
    let target = habit.target ?? 1
    switch (habit.linkedMetric) {
      case 'water':
        value = waterLog?.value ?? 0
        // Keep the habit's target aligned with the health goal so the ring's
        // "how full is it?" always references the current daily target.
        if (waterGoal > 0) target = waterGoal
        break
      case 'sleep':
        value = sleepLog?.value ?? 0
        if (sleepGoal > 0) target = sleepGoal
        break
      case 'workout':
        value = workoutDoneToday ? 1 : 0
        target = 1
        break
    }
    // Persist an updated target on the habit if it drifted from the health
    // goal — the drag rings + card headers read from habit.target.
    if (habit.target !== target) {
      await db.habits.update(habit.id!, { target })
    }
    await upsertLinkedEntry(habit, value, target, today)
  }
}

async function upsertLinkedEntry(
  habit: Habit,
  value: number,
  target: number,
  date: number,
): Promise<void> {
  const existing = await db.habit_entries
    .where('[habitId+date]')
    .equals([habit.id!, date])
    .first()
  const currentValue = existing?.value ?? 0
  const currentTarget = existing?.target ?? 0
  if (currentValue === value && currentTarget === target) return

  if (existing) {
    await db.habit_entries.update(existing.id!, { value, target })
  } else if (value > 0) {
    await db.habit_entries.add({
      habitId: habit.id!,
      date,
      value,
      target,
      createdAt: Date.now(),
    })
  } else {
    // No existing entry AND no value to log — nothing to do. Avoids
    // creating value=0 stub rows for habits the user hasn't touched.
    return
  }

  // Recompute persisted streak/longest so the header stats stay honest.
  const entries = await db.habit_entries
    .where('habitId')
    .equals(habit.id!)
    .toArray()
  const { computeStreak, computeLongestStreak } = await import('./habits')
  const streak = computeStreak(habit, entries)
  const longest = Math.max(computeLongestStreak(habit, entries), streak)
  await db.habits.update(habit.id!, { streak, longestStreak: longest })
}
