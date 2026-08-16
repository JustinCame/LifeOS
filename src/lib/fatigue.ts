import type { Exercise, Workout } from '../db/types'
import { isSetCompleted } from './fitness'

// Muscle groups we track. Matches the muscleGroups strings on Exercise so
// the fatigue model can accumulate straight from workouts.
export type MuscleGroup =
  | 'chest'
  | 'shoulders'
  | 'traps'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'obliques'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'lowerback'

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  traps: 'Traps',
  back: 'Lats',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  lowerback: 'Lower back',
}

const DAY = 86_400_000

// Map a body-muscles id → our MuscleGroup. Ids we don't recognize (head,
// face, neck, hands, feet, knees, elbows, nape, spine) return null and are
// drawn as neutral structural regions.
export function bmGroup(id: string): MuscleGroup | null {
  if (id.startsWith('chest')) return 'chest'
  if (id.startsWith('shoulder') || id.startsWith('deltoid')) return 'shoulders'
  if (id.startsWith('traps')) return 'traps'
  if (id.startsWith('lats')) return 'back'
  if (id.startsWith('biceps')) return 'biceps'
  if (id.startsWith('triceps')) return 'triceps'
  if (id.startsWith('forearm')) return 'forearms'
  if (id.startsWith('abs') || id.startsWith('serratus')) return 'core'
  if (id.startsWith('obliques')) return 'obliques'
  if (
    id.startsWith('quads') ||
    id.startsWith('hip-flexor') ||
    id.startsWith('adductors')
  )
    return 'quads'
  if (id.startsWith('hamstrings')) return 'hamstrings'
  if (id.startsWith('gluteus')) return 'glutes'
  if (id.startsWith('calves') || id.startsWith('tibialis')) return 'calves'
  if (id.startsWith('lower-back')) return 'lowerback'
  return null
}

// Compute per-group fatigue from workouts done in the last 5 days, using
// each workout's exercises + the library's per-exercise muscleGroups.
//
// Model:
//   decay = max(0, 1 - daysAgo / 5.5)
//   perGroup = (completedSets / groupCount) * decay
//   accumulate to each group of that workout
// Spillover:
//   chest/shoulders → +25% core
//   back            → +55% traps
//   biceps          → +50% forearms
//   quads           → +35% calves
//
// pct = min(100, round(acc / 12 * 100))
export function computeFatigue(
  workouts: Workout[],
  exerciseLibrary: Map<number, Exercise>,
  now: number = Date.now(),
): Record<MuscleGroup, number> {
  const acc: Partial<Record<MuscleGroup, number>> = {}
  const today0 = new Date(now)
  today0.setHours(0, 0, 0, 0)

  for (const w of workouts) {
    if (w.completedAt === undefined) continue
    const daysAgo = Math.round((today0.getTime() - startOfDay(w.date)) / DAY)
    if (daysAgo < 0 || daysAgo > 5) continue
    const decay = Math.max(0, 1 - daysAgo / 5.5)

    // Sets + groups for this workout: sum of completed sets, unique groups.
    let sets = 0
    const groups = new Set<MuscleGroup>()
    for (const ex of w.exercises) {
      for (const s of ex.sets) if (isSetCompleted(s)) sets++
      const lib = ex.exerciseId !== undefined ? exerciseLibrary.get(ex.exerciseId) : undefined
      if (lib) {
        for (const g of lib.muscleGroups) {
          if (isMuscleGroup(g)) groups.add(g)
        }
      }
    }
    if (sets === 0 || groups.size === 0) continue

    const per = (sets / groups.size) * decay
    for (const g of groups) {
      acc[g] = (acc[g] ?? 0) + per
    }
    // Spillover.
    if (groups.has('chest') || groups.has('shoulders')) {
      acc.core = (acc.core ?? 0) + per * 0.25
    }
    if (groups.has('back')) {
      acc.traps = (acc.traps ?? 0) + per * 0.55
    }
    if (groups.has('biceps')) {
      acc.forearms = (acc.forearms ?? 0) + per * 0.5
    }
    if (groups.has('quads')) {
      acc.calves = (acc.calves ?? 0) + per * 0.35
    }
  }

  const out = Object.fromEntries(
    Object.keys(MUSCLE_LABELS).map((k) => [k, 0]),
  ) as Record<MuscleGroup, number>
  for (const k in acc) {
    const v = acc[k as MuscleGroup] ?? 0
    out[k as MuscleGroup] = Math.min(100, Math.round((v / 12) * 100))
  }
  return out
}

// Simple recovery estimate. Every 25% ≈ 1 day of full rest.
export function recoveryDays(pct: number): number {
  return Math.max(0, Math.ceil(pct / 25))
}

// Sort by pct desc, drop < 8% so the list stays punchy.
export function rankFatigue(
  fatigue: Record<MuscleGroup, number>,
): { group: MuscleGroup; pct: number }[] {
  return Object.entries(fatigue)
    .map(([g, pct]) => ({ group: g as MuscleGroup, pct: pct as number }))
    .filter((r) => r.pct >= 8)
    .sort((a, b) => b.pct - a.pct)
}

// Fill formula for the SVG paths.
export function fatigueFill(pct: number): string {
  if (!pct)
    return 'color-mix(in oklab, var(--color-fg) 7%, var(--color-surface-2))'
  return `color-mix(in oklab, var(--color-accent) ${Math.round(16 + pct * 0.74)}%, var(--color-surface-2))`
}

function isMuscleGroup(g: string): g is MuscleGroup {
  return g in MUSCLE_LABELS
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
