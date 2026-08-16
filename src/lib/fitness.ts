import { db } from '../db'
import type {
  EquipmentType,
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
} from '../db/types'

export const DEFAULT_REST_SEC = 90

/* -------------------- Starter library -------------------- */

type StarterExercise = Pick<
  Exercise,
  'name' | 'muscleGroups' | 'equipment' | 'unilateral'
>

const STARTER_EXERCISES: StarterExercise[] = [
  // Chest
  { name: 'Bench Press', muscleGroups: ['chest', 'triceps', 'shoulders'], equipment: 'barbell' },
  { name: 'Incline Bench Press', muscleGroups: ['chest', 'shoulders'], equipment: 'barbell' },
  { name: 'Dumbbell Bench Press', muscleGroups: ['chest', 'triceps'], equipment: 'dumbbell' },
  { name: 'Incline Dumbbell Press', muscleGroups: ['chest', 'shoulders'], equipment: 'dumbbell' },
  { name: 'Dumbbell Fly', muscleGroups: ['chest'], equipment: 'dumbbell' },
  { name: 'Cable Fly', muscleGroups: ['chest'], equipment: 'cable' },
  { name: 'Push-up', muscleGroups: ['chest', 'triceps'], equipment: 'bodyweight' },
  { name: 'Dip', muscleGroups: ['chest', 'triceps'], equipment: 'bodyweight' },
  // Back
  { name: 'Deadlift', muscleGroups: ['back', 'glutes', 'hamstrings'], equipment: 'barbell' },
  { name: 'Barbell Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
  { name: 'Pendlay Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
  { name: 'Dumbbell Row', muscleGroups: ['back', 'biceps'], equipment: 'dumbbell', unilateral: true },
  { name: 'Lat Pulldown', muscleGroups: ['back', 'biceps'], equipment: 'cable' },
  { name: 'Pull-up', muscleGroups: ['back', 'biceps'], equipment: 'bodyweight' },
  { name: 'Cable Row', muscleGroups: ['back', 'biceps'], equipment: 'cable' },
  { name: 'Face Pull', muscleGroups: ['shoulders', 'back'], equipment: 'cable' },
  // Shoulders
  { name: 'Overhead Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'barbell' },
  { name: 'Dumbbell Shoulder Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { name: 'Lateral Raise', muscleGroups: ['shoulders'], equipment: 'dumbbell' },
  { name: 'Front Raise', muscleGroups: ['shoulders'], equipment: 'dumbbell' },
  { name: 'Rear Delt Fly', muscleGroups: ['shoulders', 'back'], equipment: 'dumbbell' },
  // Legs
  { name: 'Back Squat', muscleGroups: ['quads', 'glutes'], equipment: 'barbell' },
  { name: 'Front Squat', muscleGroups: ['quads'], equipment: 'barbell' },
  { name: 'Leg Press', muscleGroups: ['quads', 'glutes'], equipment: 'machine' },
  { name: 'Leg Extension', muscleGroups: ['quads'], equipment: 'machine' },
  { name: 'Leg Curl', muscleGroups: ['hamstrings'], equipment: 'machine' },
  { name: 'Romanian Deadlift', muscleGroups: ['hamstrings', 'glutes'], equipment: 'barbell' },
  { name: 'Hip Thrust', muscleGroups: ['glutes'], equipment: 'barbell' },
  { name: 'Bulgarian Split Squat', muscleGroups: ['quads', 'glutes'], equipment: 'dumbbell', unilateral: true },
  { name: 'Walking Lunge', muscleGroups: ['quads', 'glutes'], equipment: 'dumbbell' },
  { name: 'Calf Raise', muscleGroups: ['calves'], equipment: 'machine' },
  // Arms
  { name: 'Barbell Curl', muscleGroups: ['biceps'], equipment: 'barbell' },
  { name: 'Dumbbell Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
  { name: 'Hammer Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
  { name: 'Preacher Curl', muscleGroups: ['biceps'], equipment: 'machine' },
  { name: 'Tricep Pushdown', muscleGroups: ['triceps'], equipment: 'cable' },
  { name: 'Skull Crusher', muscleGroups: ['triceps'], equipment: 'barbell' },
  { name: 'Overhead Tricep Extension', muscleGroups: ['triceps'], equipment: 'dumbbell' },
  // Core
  { name: 'Plank', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Hanging Leg Raise', muscleGroups: ['core'], equipment: 'bodyweight' },
  { name: 'Cable Crunch', muscleGroups: ['core'], equipment: 'cable' },
  { name: 'Russian Twist', muscleGroups: ['core'], equipment: 'bodyweight' },
  // Cardio
  { name: 'Treadmill Run', muscleGroups: ['cardio'], equipment: 'cardio' },
  { name: 'Stationary Bike', muscleGroups: ['cardio'], equipment: 'cardio' },
  { name: 'Rowing Machine', muscleGroups: ['cardio', 'back'], equipment: 'cardio' },
]

// Seed the library only if completely empty (so deleted starters don't reappear).
export async function ensureStarterLibrary(): Promise<void> {
  const count = await db.exercises.count()
  if (count > 0) return
  const now = Date.now()
  await db.exercises.bulkAdd(
    STARTER_EXERCISES.map((e) => ({
      ...e,
      isCustom: false,
      createdAt: now,
      useCount: 0,
    })),
  )
}

/* -------------------- Exercise CRUD -------------------- */

export type NewExerciseInput = Pick<
  Exercise,
  'name' | 'muscleGroups' | 'equipment' | 'unilateral' | 'notes'
>

export async function addCustomExercise(input: NewExerciseInput): Promise<Exercise> {
  const createdAt = Date.now()
  const id = await db.exercises.add({
    ...input,
    isCustom: true,
    createdAt,
    useCount: 0,
  })
  return { ...input, id: id as number, isCustom: true, createdAt, useCount: 0 }
}

export async function deleteExercise(id: number): Promise<void> {
  await db.exercises.delete(id)
}

/* -------------------- Workout lifecycle -------------------- */

export async function getActiveWorkout(): Promise<Workout | undefined> {
  // Dexie doesn't index undefined values; manually filter.
  const all = await db.workouts.orderBy('date').reverse().toArray()
  return all.find((w) => w.completedAt === undefined)
}

export async function startWorkout(name = 'Workout'): Promise<number> {
  const now = Date.now()
  const id = await db.workouts.add({
    date: now,
    name,
    exercises: [],
    startedAt: now,
    createdAt: now,
  })
  return id as number
}

export async function finishWorkout(id: number): Promise<void> {
  const w = await db.workouts.get(id)
  if (!w) return
  const completedAt = Date.now()
  const durationSec = Math.max(1, Math.floor((completedAt - w.startedAt) / 1000))
  await db.workouts.update(id, { completedAt, durationSec })
}

export async function discardWorkout(id: number): Promise<void> {
  await db.workouts.delete(id)
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.workouts.delete(id)
}

export async function renameWorkout(id: number, name: string): Promise<void> {
  await db.workouts.update(id, { name: name.trim() || 'Workout' })
}

/* -------------------- Exercise + set editing -------------------- */

export async function addExerciseToWorkout(
  workoutId: number,
  exercise: Exercise,
): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  const entry: WorkoutExercise = {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: [{ reps: 0, weight: 0 }],
  }
  await db.workouts.update(workoutId, {
    exercises: [...w.exercises, entry],
  })
  if (exercise.id !== undefined) {
    await db.exercises.update(exercise.id, {
      lastUsedAt: Date.now(),
      useCount: (exercise.useCount ?? 0) + 1,
    })
  }
}

export async function removeExerciseFromWorkout(
  workoutId: number,
  exerciseIndex: number,
): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  await db.workouts.update(workoutId, {
    exercises: w.exercises.filter((_, i) => i !== exerciseIndex),
  })
}

export async function addSet(
  workoutId: number,
  exerciseIndex: number,
): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  const ex = w.exercises[exerciseIndex]
  if (!ex) return
  // Pre-fill from previous set
  const last = ex.sets[ex.sets.length - 1]
  const newSet: WorkoutSet = {
    reps: last?.reps ?? 0,
    weight: last?.weight ?? 0,
  }
  const exercises = w.exercises.slice()
  exercises[exerciseIndex] = { ...ex, sets: [...ex.sets, newSet] }
  await db.workouts.update(workoutId, { exercises })
}

export async function updateSet(
  workoutId: number,
  exerciseIndex: number,
  setIndex: number,
  patch: Partial<WorkoutSet>,
): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  const ex = w.exercises[exerciseIndex]
  if (!ex) return
  const sets = ex.sets.slice()
  sets[setIndex] = { ...sets[setIndex], ...patch }
  const exercises = w.exercises.slice()
  exercises[exerciseIndex] = { ...ex, sets }
  await db.workouts.update(workoutId, { exercises })
}

export async function removeSet(
  workoutId: number,
  exerciseIndex: number,
  setIndex: number,
): Promise<void> {
  const w = await db.workouts.get(workoutId)
  if (!w) return
  const ex = w.exercises[exerciseIndex]
  if (!ex) return
  const exercises = w.exercises.slice()
  exercises[exerciseIndex] = {
    ...ex,
    sets: ex.sets.filter((_, i) => i !== setIndex),
  }
  await db.workouts.update(workoutId, { exercises })
}

/* -------------------- Stats -------------------- */

export function isSetCompleted(s: WorkoutSet): boolean {
  return s.completedAt !== undefined
}

export function totalVolume(workout: Workout): number {
  return workout.exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets.reduce(
        (s, set) =>
          isSetCompleted(set) ? s + set.weight * set.reps : s,
        0,
      ),
    0,
  )
}

export function totalReps(workout: Workout): number {
  return workout.exercises.reduce(
    (sum, ex) =>
      sum + ex.sets.reduce((s, set) => (isSetCompleted(set) ? s + set.reps : s), 0),
    0,
  )
}

export function completedSetCount(workout: Workout): number {
  return workout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter(isSetCompleted).length,
    0,
  )
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatRestTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Render a target prescription like "4 × 5-7" or "3 × 12". Returns "" when
// no target is set (hand-made templates / workouts without a prescription).
export function formatTarget(ex: {
  targetSets?: number
  repLow?: number
  repHigh?: number
}): string {
  if (!ex.targetSets) return ''
  if (ex.repLow === undefined) return `${ex.targetSets} sets`
  const reps =
    ex.repHigh === undefined || ex.repHigh === ex.repLow
      ? `${ex.repLow}`
      : `${ex.repLow}-${ex.repHigh}`
  return `${ex.targetSets} × ${reps}`
}

/* -------------------- PRs (e1RM-based) -------------------- */

// Epley formula: estimated 1-rep max = weight × (1 + reps/30).
// Lets us compare 8 × 150 vs 5 × 180 fairly.
export function e1RM(set: WorkoutSet): number {
  if (!isSetCompleted(set) || set.reps <= 0 || set.weight <= 0) return 0
  return set.weight * (1 + set.reps / 30)
}

export interface BestSet {
  e1rm: number
  weight: number
  reps: number
  date: number
  workoutId: number
}

// Best e1RM for an exercise across the given workouts. Optionally exclude one
// workout (used to compute the PR bar BEFORE today's workout).
export function bestSetForExercise(
  workouts: Workout[],
  exerciseId: number,
  excludeWorkoutId?: number,
): BestSet | null {
  let best: BestSet | null = null
  for (const w of workouts) {
    if (w.completedAt === undefined) continue
    if (excludeWorkoutId !== undefined && w.id === excludeWorkoutId) continue
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue
      for (const set of ex.sets) {
        const e = e1RM(set)
        if (e > 0 && (!best || e > best.e1rm)) {
          best = {
            e1rm: e,
            weight: set.weight,
            reps: set.reps,
            date: w.date,
            workoutId: w.id!,
          }
        }
      }
    }
  }
  return best
}

// How many exercises in this workout set a new e1RM PR (vs all prior workouts)?
export function countPRsInWorkout(
  workout: Workout,
  allWorkouts: Workout[],
): number {
  let count = 0
  for (const ex of workout.exercises) {
    if (ex.exerciseId === undefined) continue
    const priorBest = bestSetForExercise(allWorkouts, ex.exerciseId, workout.id)
    let beat = false
    for (const set of ex.sets) {
      const e = e1RM(set)
      if (e > 0 && (priorBest === null || e > priorBest.e1rm)) {
        beat = true
        break
      }
    }
    if (beat) count++
  }
  return count
}

/* -------------------- Clone -------------------- */

// Repeat a past workout: creates a new active workout with the same exercises
// (no sets logged yet — one empty set per exercise to fill in).
export async function cloneWorkout(sourceId: number): Promise<number> {
  const source = await db.workouts.get(sourceId)
  if (!source) throw new Error('Source workout not found')

  const now = Date.now()
  const id = await db.workouts.add({
    date: now,
    name: source.name,
    exercises: source.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      sets: [{ reps: 0, weight: 0 }],
      notes: ex.notes,
    })),
    startedAt: now,
    createdAt: now,
  })
  return id as number
}

/* -------------------- Per-exercise history -------------------- */

export interface ExerciseSession {
  workoutId: number
  workoutName: string
  date: number
  sets: WorkoutSet[]
  topSet: WorkoutSet | null
  topE1RM: number
}

export function exerciseSessions(
  workouts: Workout[],
  exerciseId: number,
): ExerciseSession[] {
  const sessions: ExerciseSession[] = []
  for (const w of workouts) {
    if (w.completedAt === undefined || w.id === undefined) continue
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue
      // Take only completed sets for the session record
      const completed = ex.sets.filter(isSetCompleted)
      if (completed.length === 0) continue
      let topSet: WorkoutSet | null = null
      let topE1RM = 0
      for (const set of completed) {
        const e = e1RM(set)
        if (e > topE1RM) {
          topE1RM = e
          topSet = set
        }
      }
      sessions.push({
        workoutId: w.id,
        workoutName: w.name,
        date: w.date,
        sets: completed,
        topSet,
        topE1RM,
      })
    }
  }
  // Newest first
  sessions.sort((a, b) => b.date - a.date)
  return sessions
}

/* -------------------- AI summary -------------------- */

export function workoutToCoachPrompt(workout: Workout): string {
  const lines: string[] = []
  lines.push(`Workout: ${workout.name}`)
  lines.push(`Date: ${new Date(workout.date).toLocaleDateString()}`)
  if (workout.durationSec) lines.push(`Duration: ${formatDuration(workout.durationSec)}`)
  lines.push(`Total volume: ${Math.round(totalVolume(workout)).toLocaleString()} lb`)
  lines.push(`Total reps: ${totalReps(workout)}`)
  lines.push('')
  lines.push('Exercises:')
  for (const ex of workout.exercises) {
    const completed = ex.sets.filter(isSetCompleted)
    if (completed.length === 0) {
      lines.push(`- ${ex.exerciseName}: no completed sets`)
      continue
    }
    const setsStr = completed
      .map((s) => {
        const rpe = s.rpe ? ` @ RPE ${s.rpe}` : ''
        return `${s.reps}×${s.weight}lb${rpe}`
      })
      .join(', ')
    lines.push(`- ${ex.exerciseName}: ${setsStr}`)
  }
  return lines.join('\n')
}

export async function setWorkoutSummary(id: number, summary: string): Promise<void> {
  await db.workouts.update(id, { aiSummary: summary })
}

/* -------------------- Templates -------------------- */

export async function addTemplate(
  name: string,
  exercises: Exercise[],
): Promise<number> {
  const id = await db.workout_templates.add({
    name: name.trim(),
    exercises: exercises
      .filter((e) => e.id !== undefined)
      .map((e) => ({ exerciseId: e.id!, exerciseName: e.name })),
    createdAt: Date.now(),
    useCount: 0,
  })
  return id as number
}

export async function updateTemplate(
  id: number,
  patch: Partial<Pick<WorkoutTemplate, 'name' | 'exercises' | 'notes'>>,
): Promise<void> {
  await db.workout_templates.update(id, patch)
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.workout_templates.delete(id)
}

// Run a template = create a new active workout pre-loaded with its exercises
// (one empty set per exercise to fill in). Throws if an active workout
// already exists.
export async function runTemplate(id: number): Promise<number> {
  const template = await db.workout_templates.get(id)
  if (!template) throw new Error('Template not found')

  const existing = await getActiveWorkout()
  if (existing) {
    throw new Error(
      `An active workout "${existing.name}" is already in progress. Finish or discard it before starting a template.`,
    )
  }

  const now = Date.now()
  const workoutId = await db.workouts.add({
    date: now,
    name: template.name,
    exercises: template.exercises.map((ex) => {
      const setCount =
        ex.targetSets && ex.targetSets > 0 ? ex.targetSets : 1
      const sets: WorkoutSet[] = Array.from({ length: setCount }, () => ({
        reps: 0,
        weight: 0,
        ...(ex.restSec ? { restSec: ex.restSec } : {}),
      }))
      return {
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        sets,
        ...(ex.targetSets ? { targetSets: ex.targetSets } : {}),
        ...(ex.repLow !== undefined ? { repLow: ex.repLow } : {}),
        ...(ex.repHigh !== undefined ? { repHigh: ex.repHigh } : {}),
        ...(ex.notes ? { notes: ex.notes } : {}),
        ...(ex.alternatives && ex.alternatives.length > 0
          ? { alternatives: ex.alternatives }
          : {}),
      }
    }),
    startedAt: now,
    createdAt: now,
  })

  await db.workout_templates.update(id, {
    lastUsedAt: now,
    useCount: (template.useCount ?? 0) + 1,
  })

  // Bump useCount on each exercise too
  for (const ex of template.exercises) {
    const existing = await db.exercises.get(ex.exerciseId)
    if (existing) {
      await db.exercises.update(ex.exerciseId, {
        lastUsedAt: now,
        useCount: (existing.useCount ?? 0) + 1,
      })
    }
  }

  return workoutId as number
}

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  cardio: 'Cardio',
  other: 'Other',
}
