import { db } from '../db'

const BACKUP_VERSION = 1

// Settings that hold device-specific secrets. Excluded from exports so the
// backup is safe to paste into a note, email, or cloud doc. Preserved during
// restore so signing back in / re-pasting the API key isn't required after
// every restore.
const SENSITIVE_SETTING_KEYS = ['anthropic_api_key', 'google_auth']

export interface Backup {
  version: number
  exportedAt: string
  schemaVersion: number
  counts: Record<string, number>
  data: {
    settings: unknown[]
    tasks: unknown[]
    workouts: unknown[]
    meals: unknown[]
    transactions: unknown[]
    habits: unknown[]
    goals: unknown[]
    health_logs: unknown[]
    chat_history: unknown[]
    cached_briefs: unknown[]
    foods: unknown[]
    meal_entries: unknown[]
    cardio_sessions: unknown[]
    exercises: unknown[]
    notes: unknown[]
    workout_templates: unknown[]
    goal_journal: unknown[]
    recipes: unknown[]
    habit_entries: unknown[]
    daily_logs: unknown[]
  }
}

export async function exportAll(): Promise<Backup> {
  const allSettings = await db.settings.toArray()
  const settings = allSettings.filter(
    (s) => !SENSITIVE_SETTING_KEYS.includes(s.key),
  )
  const [
    tasks, workouts, meals, transactions, habits, goals,
    healthLogs, chatHistory, cachedBriefs, foods, mealEntries, cardioSessions,
    exercises, notes, workoutTemplates, goalJournal, recipes, habitEntries,
    dailyLogs,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.workouts.toArray(),
    db.meals.toArray(),
    db.transactions.toArray(),
    db.habits.toArray(),
    db.goals.toArray(),
    db.health_logs.toArray(),
    db.chat_history.toArray(),
    db.cached_briefs.toArray(),
    db.foods.toArray(),
    db.meal_entries.toArray(),
    db.cardio_sessions.toArray(),
    db.exercises.toArray(),
    db.notes.toArray(),
    db.workout_templates.toArray(),
    db.goal_journal.toArray(),
    db.recipes.toArray(),
    db.habit_entries.toArray(),
    db.daily_logs.toArray(),
  ])

  const data = {
    settings,
    tasks,
    workouts,
    meals,
    transactions,
    habits,
    goals,
    health_logs: healthLogs,
    chat_history: chatHistory,
    cached_briefs: cachedBriefs,
    foods,
    meal_entries: mealEntries,
    cardio_sessions: cardioSessions,
    exercises,
    notes,
    workout_templates: workoutTemplates,
    goal_journal: goalJournal,
    recipes,
    habit_entries: habitEntries,
    daily_logs: dailyLogs,
  }

  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(data)) counts[k] = v.length

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: db.verno,
    counts,
    data,
  }
}

interface ImportableTable<T> {
  clear(): Promise<void>
  bulkAdd(items: T[]): Promise<unknown>
}

export async function importAll(rawJson: string): Promise<Backup['counts']> {
  let parsed: Backup
  try {
    parsed = JSON.parse(rawJson) as Backup
  } catch {
    throw new Error('Not valid JSON.')
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(
      `Backup format ${parsed.version} not supported (expected ${BACKUP_VERSION}).`,
    )
  }
  if (!parsed.data) throw new Error('Invalid backup: missing data field.')

  const d = parsed.data

  await db.transaction(
    'rw',
    [
      db.settings, db.tasks, db.workouts, db.meals, db.transactions,
      db.habits, db.goals, db.health_logs, db.chat_history,
      db.cached_briefs, db.foods, db.meal_entries, db.cardio_sessions,
      db.exercises, db.notes, db.workout_templates, db.goal_journal,
      db.recipes, db.habit_entries, db.daily_logs,
    ],
    async () => {
      // Preserve sensitive settings — clear only non-sensitive ones.
      const allSettings = await db.settings.toArray()
      for (const s of allSettings) {
        if (!SENSITIVE_SETTING_KEYS.includes(s.key)) {
          await db.settings.delete(s.key)
        }
      }

      // Wipe every other table.
      await Promise.all([
        db.tasks.clear(),
        db.workouts.clear(),
        db.meals.clear(),
        db.transactions.clear(),
        db.habits.clear(),
        db.goals.clear(),
        db.health_logs.clear(),
        db.chat_history.clear(),
        db.cached_briefs.clear(),
        db.foods.clear(),
        db.meal_entries.clear(),
        db.cardio_sessions.clear(),
        db.exercises.clear(),
        db.notes.clear(),
        db.workout_templates.clear(),
        db.goal_journal.clear(),
        db.recipes.clear(),
        db.habit_entries.clear(),
        db.daily_logs.clear(),
      ])

      // Restore.
      const restore = async <T,>(table: ImportableTable<T>, items: unknown) => {
        const arr = (items as T[] | undefined) ?? []
        if (arr.length) await table.bulkAdd(arr)
      }
      await restore(db.settings, d.settings)
      await restore(db.tasks, d.tasks)
      await restore(db.workouts, d.workouts)
      await restore(db.meals, d.meals)
      await restore(db.transactions, d.transactions)
      await restore(db.habits, d.habits)
      await restore(db.goals, d.goals)
      await restore(db.health_logs, d.health_logs)
      await restore(db.chat_history, d.chat_history)
      await restore(db.cached_briefs, d.cached_briefs)
      await restore(db.foods, d.foods)
      await restore(db.meal_entries, d.meal_entries)
      await restore(db.cardio_sessions, d.cardio_sessions)
      await restore(db.exercises, d.exercises)
      await restore(db.notes, d.notes)
      await restore(db.workout_templates, d.workout_templates)
      await restore(db.goal_journal, d.goal_journal)
      await restore(db.recipes, d.recipes)
      await restore(db.habit_entries, d.habit_entries)
      await restore(db.daily_logs, d.daily_logs)
    },
  )

  return parsed.counts
}
