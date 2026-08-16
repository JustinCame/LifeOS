// Domain types for Life OS Dexie database.
// Field shapes are deliberately permissive so AI-generated entries can fill
// what they know without rejecting the write.

export type Priority = 'low' | 'med' | 'high'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskSource = 'manual' | 'email' | 'calendar' | 'ai'

export interface Settings {
  key: string
  value: unknown
  updatedAt: number
}

export interface Task {
  id?: number
  title: string
  description?: string
  dueDate?: number
  priority: Priority
  status: TaskStatus
  source: TaskSource
  calendarEventId?: string
  emailId?: string
  goalId?: number
  tags?: string[]
  createdAt: number
  completedAt?: number
}

export interface WorkoutSet {
  reps: number
  weight: number
  rpe?: number // 1-10 rate of perceived exertion
  restSec?: number
  completedAt?: number // undefined = not yet performed
}

// A single exercise as logged within a workout. References an Exercise from
// the library by id, but snapshots the name so renames/deletes don't rewrite
// history.
export interface WorkoutExercise {
  exerciseId?: number
  exerciseName: string
  sets: WorkoutSet[]
  notes?: string
  // Optional target prescription, copied from a template at run time so the
  // user sees what they're aiming for while logging.
  targetSets?: number
  repLow?: number
  repHigh?: number
}

export interface Workout {
  id?: number
  date: number
  name: string
  exercises: WorkoutExercise[]
  durationSec?: number
  notes?: string
  aiSummary?: string
  startedAt: number
  completedAt?: number // undefined = workout in progress
  createdAt: number
}

// Exercise library entry. Reusable across workouts.
export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'cardio'
  | 'other'

export interface Exercise {
  id?: number
  name: string
  muscleGroups: string[]
  equipment: EquipmentType
  unilateral?: boolean
  notes?: string
  isCustom: boolean
  createdAt: number
  lastUsedAt?: number
  useCount: number
}

// One exercise inside a template. Carries an optional target prescription
// (sets, rep range, rest, form notes). All target fields are optional —
// templates created by hand may have none, imported programs fill them in.
export interface WorkoutTemplateExercise {
  exerciseId: number
  exerciseName: string
  targetSets?: number
  repLow?: number
  repHigh?: number
  restSec?: number
  notes?: string
}

// A reusable workout template — a name + the list of exercises that belong to
// it. Target sets/reps/rest are optional per exercise; actual weights are
// always filled in at run time.
export interface WorkoutTemplate {
  id?: number
  name: string
  exercises: WorkoutTemplateExercise[]
  notes?: string
  createdAt: number
  lastUsedAt?: number
  useCount: number
}

// A logged cardio session — kept separate from strength workouts since it
// doesn't fit the sets/reps/weight model.
export type CardioKind = 'liss' | 'hiit'

export interface CardioSession {
  id?: number
  date: number
  kind: CardioKind
  durationMin: number
  modality?: string // free-text: "incline walk", "bike", "rower", "stairmaster"
  notes?: string
  createdAt: number
}

export interface Macros {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Meal {
  id?: number
  date: number
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  description: string
  items?: { name: string; amount?: string }[]
  macros: Macros
  source: 'manual' | 'plan' | 'ai'
  createdAt: number
}

// A reusable food in the user's library — defines per-serving macros.
export interface Food {
  id?: number
  name: string
  brand?: string
  servingSize: string // free-text: "1 cup", "100 g", "1 medium"
  servingGrams?: number // optional gram-equivalent for normalization
  macros: Macros // macros for ONE serving
  notes?: string
  // UPC / EAN barcode if the food was scanned or imported from a barcode
  // lookup. Indexed in Dexie so future scans hit the library directly
  // instead of creating duplicates.
  barcode?: string
  createdAt: number
  lastUsedAt?: number
  useCount: number
}

// A logged food entry on a specific day + meal slot. Macros are denormalized
// (snapshotted at log time) so editing or deleting the source food doesn't
// rewrite history.
//
// Either foodId or recipeId is set — foodId for entries sourced from the
// food library (the common case), recipeId when the user logs a whole recipe
// as a single entry. foodName holds the display name in both cases.
export interface MealEntry {
  id?: number
  date: number // start-of-day timestamp
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foodId?: number
  recipeId?: number
  foodName: string
  servings: number
  macros: Macros // already scaled by servings
  notes?: string
  createdAt: number
}

// One ingredient inside a recipe. Snapshots foodName + per-serving macros so
// editing or deleting the source food later doesn't retroactively change what
// the recipe totals. `servings` is how many servings of that food the recipe
// calls for (e.g., "2 eggs" = 2 servings of the "1 egg" food).
export interface RecipeIngredient {
  foodId: number
  foodName: string
  servings: number
  macrosPerServing: Macros // snapshot at add time
}

// A user-defined recipe = a bundle of ingredients that can be logged as one
// meal entry. `yields` is the number of servings the whole recipe makes so a
// user cooking a 4-serving pot of chili can log 1 serving at a time later.
export interface Recipe {
  id?: number
  name: string
  ingredients: RecipeIngredient[]
  yields: number // how many servings the whole recipe makes; must be > 0
  notes?: string
  createdAt: number
  lastUsedAt?: number
  useCount: number
}

export interface Transaction {
  id?: number
  date: number
  amount: number
  merchant?: string
  description: string
  category?: string
  account?: string
  source: 'email' | 'manual'
  emailId?: string
  createdAt: number
}

// Habit kinds:
//   binary   — done / not done (default; brushed teeth)
//   count    — accumulate toward a target (pages read)
//   duration — accumulate time toward a target (minutes meditated)
//   avoid    — the goal is to keep a "0" (no soda). "No entry" counts as kept.
export type HabitKind = 'binary' | 'count' | 'duration' | 'avoid'

// Scheduling modes:
//   daily     — every day is a scheduled day
//   weekdays  — only specific weekdays (0=Sun … 6=Sat)
//   perWeek   — hit N times per ISO week, any days
export type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }
  | { mode: 'perWeek'; perWeek: number }

export interface Habit {
  id?: number
  name: string
  kind: HabitKind
  target?: number // count / duration only
  unit?: string   // 'pages', 'min', … count / duration only
  schedule: HabitSchedule
  streak: number
  longestStreak: number
  createdAt: number
  archivedAt?: number
  // Optional single glyph shown inside the small ring on the Today screen so
  // habits are distinguishable at a glance. Falls back to a completion
  // checkmark when unset and the habit is done.
  emoji?: string
  // Optional link to an external data source. When set, the habit's daily
  // completion is derived from that source (water/sleep meeting the goal, or
  // a workout completed today). Toggling a water/sleep-linked habit ON also
  // fills the linked log to its goal. Only meaningful on binary habits.
  linkedMetric?: 'water' | 'sleep' | 'workout'
  // When set, this habit sorts above unpinned habits on the Habits screen.
  // Timestamp so multiple pinned habits order by most-recently-pinned first.
  pinnedAt?: number
  // Vacation / hiatus ranges. Days that fall in any range are treated as
  // rest days by streak + consistency (they don't count for or against you)
  // and rendered in the pause color on the heatmap. The last range having
  // no `end` means the habit is currently paused.
  pauseRanges?: { start: number; end?: number }[]
}

// One entry per habit per day — replaces the old `history: number[]` array on
// Habit so we can express partial progress. Target is snapshotted at log time
// so a raised bar tomorrow doesn't retroactively demote yesterday's success.
export interface HabitEntry {
  id?: number
  habitId: number
  date: number  // startOfDay ms
  value: number // count / duration: amount. binary / avoid: 0 or 1
  target: number
  note?: string
  createdAt: number
}

export interface Milestone {
  title: string
  completed: boolean
  completedAt?: number
}

export type GoalTerm = 'short' | 'mid' | 'long'

export interface Goal {
  id?: number
  title: string
  description?: string
  term: GoalTerm
  targetDate?: number
  milestones?: Milestone[]
  progress: number
  status: 'active' | 'completed' | 'paused'
  createdAt: number
  completedAt?: number
}

export interface GoalJournalEntry {
  id?: number
  goalId: number
  text: string
  createdAt: number
}

export interface HealthLog {
  id?: number
  date: number
  type: 'sleep' | 'water' | 'weight' | 'mood' | 'energy' | 'other'
  value: number
  unit?: string
  notes?: string
  createdAt: number
}

export interface ChatMessage {
  id?: number
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  contextSnapshot?: unknown
  createdAt: number
}

export interface CachedBrief {
  id?: number
  type: 'morning' | 'evening' | 'weekly'
  date: string
  content: string
  createdAt: number
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
}

// Freeform notes — simple title + body, auto-saved as you type.
export interface Note {
  id?: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}
