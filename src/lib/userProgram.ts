import { db, getSetting, setSetting } from '../db'
import type {
  EquipmentType,
  Workout,
} from '../db/types'

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

/* -------------------- Program install (real exercise data) -------------------- */

// One slot in a day's plan. Sets/rep-range/rest/notes match the user's
// program spec; alternatives are the 3 swap-outs surfaced by the live
// session's Swap sheet.
interface PlanSlot {
  name: string
  equipment: EquipmentType
  muscleGroups: string[]
  sets: number
  repLow?: number
  repHigh?: number
  restSec: number
  notes?: string
  alternatives: string[]
}

interface DayPlan {
  key: LiftKey
  templateName: string
  slots: PlanSlot[]
}

// Bump this if the plan data materially changes so the installer will
// re-run and overwrite whatever's in Dexie.
const PROGRAM_VERSION = 1
const INSTALL_KEY = 'user_program_installed_v'

const PROGRAM: DayPlan[] = [
  {
    key: 'upper',
    templateName: 'PPLUL · Upper',
    slots: [
      {
        name: 'Overhead Press',
        equipment: 'barbell',
        muscleGroups: ['shoulders', 'triceps'],
        sets: 4,
        repLow: 6,
        repHigh: 8,
        restSec: 150,
        notes: 'BB or seated DB — DB if rack is taken.',
        alternatives: ['Smith Machine OHP', 'Machine Shoulder Press', 'Cable Overhead Press'],
      },
      {
        name: 'Weighted Dips',
        equipment: 'bodyweight',
        muscleGroups: ['chest', 'triceps', 'shoulders'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        notes: 'Or Close-Grip Bench.',
        alternatives: ['Tricep Pushdown heavy', 'Smith Machine Close-Grip Bench', 'Bench Dips weighted'],
      },
      {
        name: 'One-Arm DB Row',
        equipment: 'dumbbell',
        muscleGroups: ['back', 'biceps'],
        sets: 4,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        notes: 'Per arm.',
        alternatives: ['Chest-Supported DB Row', 'Cable Row single arm', 'Machine Row'],
      },
      {
        name: 'Incline DB Curl',
        equipment: 'dumbbell',
        muscleGroups: ['biceps'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        alternatives: ['Preacher Curl', 'Cable Curl with supination', 'Spider Curl on incline bench'],
      },
      {
        name: 'Cable Lateral Raise',
        equipment: 'cable',
        muscleGroups: ['shoulders'],
        sets: 4,
        repLow: 12,
        repHigh: 15,
        restSec: 60,
        alternatives: ['DB Lateral Raise', 'Machine Lateral Raise', 'Band Lateral Raise'],
      },
      {
        name: 'Tricep Dips',
        equipment: 'bodyweight',
        muscleGroups: ['triceps'],
        sets: 3,
        repLow: 10,
        repHigh: 15,
        restSec: 90,
        notes: 'Bench dips or DB skullcrusher.',
        alternatives: ['Cable Overhead Tricep Extension', 'Tricep Rope Pushdown', 'Close-Grip Push-up'],
      },
      {
        name: 'Hanging Leg Raise',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        sets: 3,
        repLow: 10,
        repHigh: 15,
        restSec: 60,
        alternatives: ['Lying Leg Raise flat bench', "Captain's Chair Leg Raise", 'Ab Wheel Rollout'],
      },
    ],
  },
  {
    key: 'lower',
    templateName: 'PPLUL · Lower',
    slots: [
      {
        name: 'Bulgarian Split Squat',
        equipment: 'dumbbell',
        muscleGroups: ['quads', 'glutes'],
        sets: 4,
        repLow: 8,
        repHigh: 8,
        restSec: 150,
        notes: 'Per leg. Main lift — start light, these are brutal.',
        alternatives: ['Hack Squat', 'Leg Press single leg', 'Reverse Lunge heavy'],
      },
      {
        name: 'Hip Thrust',
        equipment: 'barbell',
        muscleGroups: ['glutes', 'hamstrings'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        notes: 'Drive through heels, squeeze glutes at top.',
        alternatives: ['Glute Bridge on floor', 'Cable Pull-Through', 'Donkey Kick Machine'],
      },
      {
        name: 'Stiff-Leg Deadlift',
        equipment: 'barbell',
        muscleGroups: ['hamstrings', 'glutes', 'lowerback'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        notes: 'DB or BB. Feel the stretch, slow eccentric.',
        alternatives: ['Romanian Deadlift', 'Single-Leg RDL', 'Good Morning'],
      },
      {
        name: 'Leg Extension',
        equipment: 'machine',
        muscleGroups: ['quads'],
        sets: 3,
        repLow: 12,
        repHigh: 15,
        restSec: 90,
        alternatives: ['Terminal Knee Extension with band', 'Wall Sit', 'Single-Leg Press for quad focus'],
      },
      {
        name: 'Seated Leg Curl',
        equipment: 'machine',
        muscleGroups: ['hamstrings'],
        sets: 3,
        repLow: 12,
        repHigh: 15,
        restSec: 90,
        alternatives: ['Lying Leg Curl', 'Nordic Curl', 'Single-Leg Lying Curl'],
      },
      {
        name: 'Seated Calf Raise',
        equipment: 'machine',
        muscleGroups: ['calves'],
        sets: 4,
        repLow: 12,
        repHigh: 15,
        restSec: 60,
        alternatives: ['Standing Calf Raise', 'Leg Press Calf Raise', 'Single-Leg Bodyweight Calf Raise weighted'],
      },
      {
        name: 'Weighted Decline Sit-up',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        sets: 3,
        repLow: 12,
        repHigh: 15,
        restSec: 60,
        notes: 'Hold plate to chest.',
        alternatives: ['Cable Crunch', 'Ab Wheel Rollout', 'Hanging Leg Raise'],
      },
    ],
  },
  {
    key: 'push',
    templateName: 'PPLUL · Push',
    slots: [
      {
        name: 'Barbell Bench Press',
        equipment: 'barbell',
        muscleGroups: ['chest', 'triceps', 'shoulders'],
        sets: 4,
        repLow: 5,
        repHigh: 7,
        restSec: 180,
        notes: 'Main lift, RPE 7-8. Start at 60% of old working weight week 1 and build up.',
        alternatives: ['DB Bench Press', 'Machine Chest Press', 'Smith Machine Bench Press'],
      },
      {
        name: 'Incline Dumbbell Press',
        equipment: 'dumbbell',
        muscleGroups: ['chest', 'shoulders'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        alternatives: ['Incline Barbell Press', 'Incline Machine Press', 'Incline Smith Machine Press'],
      },
      {
        name: 'Seated DB Shoulder Press',
        equipment: 'dumbbell',
        muscleGroups: ['shoulders', 'triceps'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        alternatives: ['Machine Shoulder Press', 'Smith Machine Shoulder Press', 'Arnold Press'],
      },
      {
        name: 'DB Fly',
        equipment: 'dumbbell',
        muscleGroups: ['chest'],
        sets: 3,
        repLow: 12,
        repHigh: 15,
        restSec: 90,
        notes: 'Flat or incline. 3-sec eccentric, feel the stretch.',
        alternatives: ['Cable Chest Fly', 'Pec Deck Machine', 'Resistance Band Fly'],
      },
      {
        name: 'Lateral Raises',
        equipment: 'dumbbell',
        muscleGroups: ['shoulders'],
        sets: 4,
        repLow: 12,
        repHigh: 15,
        restSec: 60,
        notes: 'Light and strict, no swinging.',
        alternatives: ['Cable Lateral Raise', 'Machine Lateral Raise', 'Behind-the-body Cable Lateral'],
      },
      {
        name: 'Tricep Rope Pushdown',
        equipment: 'cable',
        muscleGroups: ['triceps'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        alternatives: ['Tricep Bar Pushdown', 'Single-Arm Cable Pushdown', 'Resistance Band Pushdown'],
      },
      {
        name: 'Single-Arm Overhead DB Tricep Extension',
        equipment: 'dumbbell',
        muscleGroups: ['triceps'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        notes: 'Per arm.',
        alternatives: ['Tricep Dips on bench', 'Cable Overhead Tricep Extension', 'EZ Bar Overhead Extension'],
      },
    ],
  },
  {
    key: 'pull',
    templateName: 'PPLUL · Pull',
    slots: [
      {
        name: 'Trap Bar Deadlift',
        equipment: 'barbell',
        muscleGroups: ['back', 'glutes', 'hamstrings', 'lowerback'],
        sets: 3,
        repLow: 5,
        repHigh: 5,
        restSec: 180,
        notes: 'Start light, build form over first 3-4 weeks.',
        alternatives: ['Romanian Deadlift', 'Rack Pull', 'DB Deadlift'],
      },
      {
        name: 'Weighted Pull-ups',
        equipment: 'bodyweight',
        muscleGroups: ['back', 'biceps'],
        sets: 4,
        repLow: 5,
        repHigh: 8,
        restSec: 150,
        notes: 'Bodyweight AMRAP if you can\'t add weight yet. Stop 1 rep short of failure on first 3 sets; last set to failure.',
        alternatives: ['Assisted Pull-up Machine', 'Lat Pulldown wide grip', 'Resistance Band Pull-ups'],
      },
      {
        name: 'Chest-Supported DB Row',
        equipment: 'dumbbell',
        muscleGroups: ['back', 'biceps'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 120,
        alternatives: ['One-Arm DB Row', 'Cable Row', 'Machine Row'],
      },
      {
        name: 'Lat Pulldown',
        equipment: 'cable',
        muscleGroups: ['back', 'biceps'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        notes: 'Neutral grip.',
        alternatives: ['Wide Grip Lat Pulldown', 'Straight Arm Cable Pulldown', 'Resistance Band Pulldown'],
      },
      {
        name: 'Reverse Pec Deck',
        equipment: 'machine',
        muscleGroups: ['shoulders', 'back'],
        sets: 3,
        repLow: 15,
        repHigh: 15,
        restSec: 60,
        alternatives: ['Rear Delt DB Fly on incline bench', 'Cable Face Pull', 'Band Pull-Apart'],
      },
      {
        name: 'DB Curl',
        equipment: 'dumbbell',
        muscleGroups: ['biceps'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 90,
        alternatives: ['Barbell Curl', 'Cable Curl', 'Resistance Band Curl'],
      },
      {
        name: 'Hammer Curl',
        equipment: 'dumbbell',
        muscleGroups: ['biceps', 'forearms'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        alternatives: ['Rope Hammer Curl on cable', 'Cross-body DB Curl', 'Neutral Grip Barbell Curl'],
      },
    ],
  },
  {
    key: 'legs',
    templateName: 'PPLUL · Legs',
    slots: [
      {
        name: 'Back Squat',
        equipment: 'barbell',
        muscleGroups: ['quads', 'glutes', 'hamstrings'],
        sets: 4,
        repLow: 5,
        repHigh: 7,
        restSec: 180,
        notes: 'Main lift, RPE 7-8. Start at 60% of old working weight week 1. Backup if rack is taken: Hack Squat 4×6-8.',
        alternatives: ['Hack Squat Machine', 'Leg Press heavy', 'Bulgarian Split Squat'],
      },
      {
        name: 'Romanian Deadlift',
        equipment: 'barbell',
        muscleGroups: ['hamstrings', 'glutes', 'lowerback'],
        sets: 3,
        repLow: 8,
        repHigh: 10,
        restSec: 150,
        notes: 'Slow eccentric, feel your hamstrings load.',
        alternatives: ['Stiff-Leg DB Deadlift', 'Single-Leg RDL', 'Good Morning'],
      },
      {
        name: 'Leg Press',
        equipment: 'machine',
        muscleGroups: ['quads', 'glutes'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 120,
        notes: "Feet mid-height on platform, don't lock knees at top.",
        alternatives: ['Hack Squat', 'Pendulum Squat', 'Belt Squat'],
      },
      {
        name: 'Walking DB Lunges',
        equipment: 'dumbbell',
        muscleGroups: ['quads', 'glutes'],
        sets: 3,
        repLow: 10,
        repHigh: 10,
        restSec: 90,
        notes: "Per leg. Stay upright, don't let front knee cave.",
        alternatives: ['Reverse Lunge', 'Step-Up with DBs', 'Bulgarian Split Squat'],
      },
      {
        name: 'Leg Curl',
        equipment: 'machine',
        muscleGroups: ['hamstrings'],
        sets: 3,
        repLow: 10,
        repHigh: 12,
        restSec: 90,
        alternatives: ['Seated Leg Curl', 'Nordic Curl', 'Single-Leg DB Curl on bench'],
      },
      {
        name: 'Standing Calf Raise',
        equipment: 'machine',
        muscleGroups: ['calves'],
        sets: 4,
        repLow: 10,
        repHigh: 12,
        restSec: 60,
        notes: "Full stretch at bottom, full contraction at top. Don't bounce.",
        alternatives: ['Seated Calf Raise', 'Leg Press Calf Raise', 'Single-Leg Bodyweight Calf Raise weighted'],
      },
    ],
  },
]

// Upsert an exercise by name — used for the primary slot AND every
// alternative so swaps at runtime resolve cleanly to a library entry.
async function ensureExercise(
  name: string,
  equipment: EquipmentType,
  muscleGroups: string[],
  notes?: string,
): Promise<number> {
  const existing = await db.exercises.where('name').equals(name).first()
  if (existing) {
    // Update muscleGroups + equipment in case the install has better data.
    await db.exercises.update(existing.id!, {
      equipment,
      muscleGroups,
      ...(notes ? { notes } : {}),
    })
    return existing.id!
  }
  const id = await db.exercises.add({
    name,
    equipment,
    muscleGroups,
    isCustom: true,
    createdAt: Date.now(),
    useCount: 0,
    ...(notes ? { notes } : {}),
  })
  return id as number
}

// Wipe + reinstall the user's five templates. Replaces any existing
// template with the matching name so re-running is a hard reset.
export async function installUserProgram(): Promise<void> {
  const now = Date.now()
  for (const day of PROGRAM) {
    // Delete any existing template with this name (typically the old
    // built-in PPLUL entries).
    const existingTemplates = await db.workout_templates
      .where('name')
      .equals(day.templateName)
      .toArray()
    for (const t of existingTemplates) {
      await db.workout_templates.delete(t.id!)
    }

    const templateExercises = []
    for (const slot of day.slots) {
      const mainId = await ensureExercise(
        slot.name,
        slot.equipment,
        slot.muscleGroups,
        slot.notes,
      )
      // Best-effort add alternatives to the library too. Fine if they collide
      // with real exercises — ensureExercise just updates in place.
      for (const alt of slot.alternatives) {
        await ensureExercise(alt, slot.equipment, slot.muscleGroups)
      }
      templateExercises.push({
        exerciseId: mainId,
        exerciseName: slot.name,
        targetSets: slot.sets,
        ...(slot.repLow !== undefined ? { repLow: slot.repLow } : {}),
        ...(slot.repHigh !== undefined ? { repHigh: slot.repHigh } : {}),
        restSec: slot.restSec,
        ...(slot.notes ? { notes: slot.notes } : {}),
        alternatives: slot.alternatives,
      })
    }

    await db.workout_templates.add({
      name: day.templateName,
      exercises: templateExercises,
      createdAt: now,
      useCount: 0,
    })
  }
  await setSetting(INSTALL_KEY, PROGRAM_VERSION)
}

// Called on Fitness mount — installs the program if the stored version is
// stale so program tweaks propagate without any user action.
export async function ensureUserProgramInstalled(): Promise<void> {
  const installed = await getSetting<number>(INSTALL_KEY)
  if (installed === PROGRAM_VERSION) return
  await installUserProgram()
}
