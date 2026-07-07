import Dexie, { type Table } from 'dexie'
import type {
  Settings,
  Task,
  Workout,
  Meal,
  Transaction,
  Habit,
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
