import Dexie, { type Table } from 'dexie'
import type {
  Settings,
  Task,
  Workout,
  Meal,
  Transaction,
  DailyLog,
  Habit,
  HabitEntry,
  HabitSchedule,
  Goal,
  HealthLog,
  ChatMessage,
  CachedBrief,
  Food,
  MealEntry,
  GoalJournalEntry,
  Exercise,
  WorkoutTemplate,
  CardioSession,
  Note,
  Recipe,
  Insight,
} from './types'

class LifeOSDB extends Dexie {
  settings!: Table<Settings, string>
  tasks!: Table<Task, number>
  workouts!: Table<Workout, number>
  meals!: Table<Meal, number>
  transactions!: Table<Transaction, number>
  habits!: Table<Habit, number>
  goals!: Table<Goal, number>
  health_logs!: Table<HealthLog, number>
  chat_history!: Table<ChatMessage, number>
  cached_briefs!: Table<CachedBrief, number>
  foods!: Table<Food, number>
  meal_entries!: Table<MealEntry, number>
  goal_journal!: Table<GoalJournalEntry, number>
  exercises!: Table<Exercise, number>
  workout_templates!: Table<WorkoutTemplate, number>
  cardio_sessions!: Table<CardioSession, number>
  notes!: Table<Note, number>
  recipes!: Table<Recipe, number>
  habit_entries!: Table<HabitEntry, number>
  daily_logs!: Table<DailyLog, number>
  insights!: Table<Insight, number>

  constructor() {
    super('LifeOS')
    this.version(1).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
    })

    this.version(2).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
    })

    this.version(3).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      // goals: + term index
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      // new — per-goal progress journal
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
    })

    this.version(4).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      // workouts: + completedAt for filtering active vs completed
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      // new — exercise library (reusable across workouts)
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
    })

    this.version(5).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      // new — saved workout templates
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
    })

    this.version(6).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      // new — logged cardio sessions (LISS / HIIT)
      cardio_sessions: '++id, date, kind, createdAt',
    })

    this.version(7).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      // new — freeform notes (title + body, auto-saved)
      notes: '++id, updatedAt, createdAt',
    })

    this.version(8).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      // foods: + barcode index so future barcode scans hit the library directly
      foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      notes: '++id, updatedAt, createdAt',
    })

    this.version(9).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, archived, lastCompleted, createdAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
      // meal_entries: + recipeId index so we can find entries logged from a
      // given recipe (used by history views + future stats)
      meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      notes: '++id, updatedAt, createdAt',
      // new — user recipes: bundles of foods that log as a single meal entry
      recipes: '++id, name, lastUsedAt, useCount, createdAt',
    })

    this.version(10)
      .stores({
        settings: '&key, updatedAt',
        tasks:
          '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
        workouts: '++id, date, completedAt, createdAt',
        meals: '++id, date, type, [date+type], createdAt',
        transactions: '++id, date, category, source, emailId, createdAt',
        // habits: dropped `archived` + `lastCompleted` indexes (moved to
        // archivedAt / derived); kept `name` + `createdAt`. New timestamped
        // archivedAt makes "restore later" trivial.
        habits: '++id, name, createdAt, archivedAt',
        goals: '++id, status, term, targetDate, createdAt',
        health_logs: '++id, date, type, [date+type], createdAt',
        chat_history:
          '++id, conversationId, [conversationId+createdAt], createdAt',
        cached_briefs: '++id, type, date, [type+date], createdAt',
        foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
        meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
        goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
        exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
        workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
        cardio_sessions: '++id, date, kind, createdAt',
        notes: '++id, updatedAt, createdAt',
        recipes: '++id, name, lastUsedAt, useCount, createdAt',
        // new — one row per habit per day; compound [habitId+date] enables the
        // cheap "did we log this habit today?" lookup that per-day upserts and
        // 30-day heatmaps rely on.
        habit_entries: '++id, habitId, date, [habitId+date], createdAt',
      })
      .upgrade(async (tx) => {
        // Legacy habit rows have `history: number[]`, `frequency`,
        // `customDays`, `lastCompleted`, `archived?`. Convert each to the new
        // shape: kind=binary, schedule from frequency+customDays,
        // archivedAt from archived flag. Blow up the history array into
        // per-day habit_entries so no completion data is lost.
        interface LegacyHabit {
          id: number
          history?: number[]
          frequency?: 'daily' | 'weekly' | 'custom'
          customDays?: number[]
          archived?: boolean
        }
        const habits = await tx.table<LegacyHabit>('habits').toArray()
        for (const h of habits) {
          const startOfDay = (ts: number) => {
            const d = new Date(ts)
            d.setHours(0, 0, 0, 0)
            return d.getTime()
          }
          // Dedupe by day since the old model allowed multiple check-ins.
          const seenDays = new Set<number>()
          for (const ts of h.history ?? []) {
            const day = startOfDay(ts)
            if (seenDays.has(day)) continue
            seenDays.add(day)
            await tx.table('habit_entries').add({
              habitId: h.id,
              date: day,
              value: 1,
              target: 1,
              createdAt: ts,
            })
          }

          let schedule: HabitSchedule = { mode: 'daily' }
          if (h.frequency === 'custom' && h.customDays?.length) {
            schedule = { mode: 'weekdays', days: h.customDays }
          } else if (h.frequency === 'weekly') {
            // Older "weekly" habits had no day list — treat as 1x/week.
            schedule = { mode: 'perWeek', perWeek: 1 }
          }

          await tx.table('habits').update(h.id, {
            kind: 'binary',
            schedule,
            archivedAt: h.archived ? Date.now() : undefined,
            history: undefined,
            frequency: undefined,
            customDays: undefined,
            lastCompleted: undefined,
            archived: undefined,
          })
        }
      })

    // v11: convert water tracking from liters to US cups (1 L ≈ 4.22675 c).
    // Existing water health_logs and the saved water goal are converted so
    // historical trends still line up after the unit switch. Same schema
    // shape as v10.
    this.version(11)
      .stores({
        settings: '&key, updatedAt',
        tasks:
          '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
        workouts: '++id, date, completedAt, createdAt',
        meals: '++id, date, type, [date+type], createdAt',
        transactions: '++id, date, category, source, emailId, createdAt',
        habits: '++id, name, createdAt, archivedAt',
        goals: '++id, status, term, targetDate, createdAt',
        health_logs: '++id, date, type, [date+type], createdAt',
        chat_history:
          '++id, conversationId, [conversationId+createdAt], createdAt',
        cached_briefs: '++id, type, date, [type+date], createdAt',
        foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
        meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
        goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
        exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
        workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
        cardio_sessions: '++id, date, kind, createdAt',
        notes: '++id, updatedAt, createdAt',
        recipes: '++id, name, lastUsedAt, useCount, createdAt',
        habit_entries: '++id, habitId, date, [habitId+date], createdAt',
      })
      .upgrade(async (tx) => {
        const L_TO_CUPS = 4.22675
        const waterLogs = await tx
          .table('health_logs')
          .where('type')
          .equals('water')
          .toArray()
        for (const log of waterLogs) {
          await tx.table('health_logs').update(log.id, {
            value: log.value * L_TO_CUPS,
            unit: 'cups',
          })
        }
        const oldGoal = await tx.table('settings').get('goal_water_L')
        if (oldGoal) {
          await tx.table('settings').put({
            key: 'goal_water_cups',
            value: (oldGoal.value as number) * L_TO_CUPS,
            updatedAt: Date.now(),
          })
          await tx.table('settings').delete('goal_water_L')
        }
      })

    // v12: new daily_logs store for the "What did you do today?" prompt +
    // Notes calendar. `date` is unique (one entry per calendar day) so
    // upserts use it as the key.
    this.version(12).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, createdAt, archivedAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      notes: '++id, updatedAt, createdAt',
      recipes: '++id, name, lastUsedAt, useCount, createdAt',
      habit_entries: '++id, habitId, date, [habitId+date], createdAt',
      daily_logs: '++id, &date, updatedAt',
    })

    // v13: new insights store for the passive-insight layer. Compound
    // [kind+date] powers per-day dedupe checks; [status+date] powers the
    // "which insights should render on Home today" query. subjectKey is
    // indexed so per-entity dedupe (e.g. per-exercise lift_stalled) can
    // scan a small slice instead of the whole table.
    this.version(13).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, createdAt, archivedAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      notes: '++id, updatedAt, createdAt',
      recipes: '++id, name, lastUsedAt, useCount, createdAt',
      habit_entries: '++id, habitId, date, [habitId+date], createdAt',
      daily_logs: '++id, &date, updatedAt',
      insights:
        '++id, coach, kind, date, status, [kind+date], [status+date], subjectKey, createdAt',
    })

    // v14: notes get pinnedAt / archivedAt / *tags indexes for the
    // Notes-tab upgrade (search, pin, tag filter, archive). Existing rows
    // stay valid — the new fields are optional and default to undefined
    // (unpinned, unarchived, untagged).
    this.version(14).stores({
      settings: '&key, updatedAt',
      tasks:
        '++id, status, dueDate, priority, source, calendarEventId, emailId, goalId, createdAt, *tags',
      workouts: '++id, date, completedAt, createdAt',
      meals: '++id, date, type, [date+type], createdAt',
      transactions: '++id, date, category, source, emailId, createdAt',
      habits: '++id, name, createdAt, archivedAt',
      goals: '++id, status, term, targetDate, createdAt',
      health_logs: '++id, date, type, [date+type], createdAt',
      chat_history:
        '++id, conversationId, [conversationId+createdAt], createdAt',
      cached_briefs: '++id, type, date, [type+date], createdAt',
      foods: '++id, name, barcode, lastUsedAt, useCount, createdAt',
      meal_entries: '++id, date, type, foodId, recipeId, [date+type], createdAt',
      goal_journal: '++id, goalId, [goalId+createdAt], createdAt',
      exercises: '++id, name, isCustom, lastUsedAt, useCount, createdAt',
      workout_templates: '++id, name, lastUsedAt, useCount, createdAt',
      cardio_sessions: '++id, date, kind, createdAt',
      notes: '++id, updatedAt, createdAt, pinnedAt, archivedAt, *tags',
      recipes: '++id, name, lastUsedAt, useCount, createdAt',
      habit_entries: '++id, habitId, date, [habitId+date], createdAt',
      daily_logs: '++id, &date, updatedAt',
      insights:
        '++id, coach, kind, date, status, [kind+date], [status+date], subjectKey, createdAt',
    })
  }
}

export const db = new LifeOSDB()

export async function getSetting<T = unknown>(
  key: string,
): Promise<T | undefined> {
  const row = await db.settings.get(key)
  return row?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value, updatedAt: Date.now() })
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key)
}
