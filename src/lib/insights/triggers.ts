// Passive-insight trigger registry.
//
// One trigger = one situation the app is watching for. `check()` returns
// `null` in the common case — that's the whole point of the registry, so the
// model is only asked to comment on situations that are actually notable.
//
// Adding a trigger:
//   1. Write check() as pure TS against Dexie tables. Return null when
//      nothing is worth saying.
//   2. Include only the data the model needs in `slice`. This is what gets
//      hashed for dedupe and what the model sees.
//   3. Pick a surface + coach for rendering; the engine bins insights by
//      surface so screens can query just what they render.

import { db } from '../../db'
import { getMacroGoal, MEAL_ORDER, sumMacros, type MacroKey } from '../macros'
import { startOfToday } from '../health'
import {
  computeFatigue,
  MUSCLE_LABELS,
  rankFatigue,
  recoveryDays,
  type MuscleGroup,
} from '../fatigue'
import {
  bestSetForExercise,
  exerciseSessions,
  isSetCompleted,
  totalReps,
  totalVolume,
} from '../fitness'
import { PROGRAM, todaysLift } from '../userProgram'
import type {
  Food,
  InsightCoach,
  InsightSeverity,
  MealEntry,
} from '../../db/types'
import type { ModelTier } from './generate'

export interface TriggerContext {
  now: Date
  today: number
}

export interface TriggerResult {
  // Scopes per-entity dedupe. E.g. per-exercise for lift_stalled, per-habit
  // for habit_slip, per-focus-macro for macro_gap. Combined with ttlHours,
  // this is what stops the same insight from re-appearing right after
  // dismissal. Omitted → dedupe is by inputHash only.
  subjectKey?: string
  severity: InsightSeverity
  // ONLY the data the model needs. Hashed for dedupe — avoid including
  // timestamps or anything else that busts the hash without changing what
  // the model would say.
  slice: Record<string, unknown>
  // One line telling the model what to comment on. Gets prepended to the
  // slice in the user message.
  promptHint: string
}

export interface Trigger {
  id: string
  coach: InsightCoach
  surface: string
  model: ModelTier
  cadence: 'on_write' | 'scheduled' | 'both'
  ttlHours: number // don't re-fire same subjectKey within this window
  check(ctx: TriggerContext): Promise<TriggerResult[] | null>
}

// ---- macro_gap ----
//
// Fires after a meal_entries row is inserted. Skips if the user is on-pace
// across all macros. Otherwise builds a slice describing the deficit + a
// candidate food list ranked by how well each closes the focus gap.

const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fat']

async function checkMacroGap(
  ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const entries = await db.meal_entries
    .where('date')
    .equals(ctx.today)
    .toArray()
  if (entries.length === 0) return null

  const totals = sumMacros(entries)
  const goals = {
    calories: await getMacroGoal('calories'),
    protein: await getMacroGoal('protein'),
    carbs: await getMacroGoal('carbs'),
    fat: await getMacroGoal('fat'),
  }
  const remaining = {
    calories: goals.calories - totals.calories,
    protein: goals.protein - totals.protein,
    carbs: goals.carbs - totals.carbs,
    fat: goals.fat - totals.fat,
  }

  // Pick the "focus" macro — the one furthest below goal as a percentage of
  // the goal itself. Excludes calories (which is a rollup) unless calories
  // is dramatically off. Skip firing if nothing's off by more than 20%.
  const macroPct = (m: MacroKey) => remaining[m] / Math.max(1, goals[m])
  const proteinPct = macroPct('protein')
  const carbsPct = macroPct('carbs')
  const fatPct = macroPct('fat')
  const caloriesPct = macroPct('calories')

  const gapsInPct: { key: MacroKey; pctRemaining: number }[] = [
    { key: 'protein', pctRemaining: proteinPct },
    { key: 'carbs', pctRemaining: carbsPct },
    { key: 'fat', pctRemaining: fatPct },
    { key: 'calories', pctRemaining: caloriesPct },
  ]

  // Focus on the biggest under-target macro. If nothing's under-target by
  // more than 20% AND no macro is over by more than 15%, skip — user is on
  // track and the model has nothing useful to say.
  const biggestDeficit = gapsInPct
    .filter((g) => g.key !== 'calories')
    .reduce((a, b) => (a.pctRemaining > b.pctRemaining ? a : b))
  const biggestExcess = MACRO_KEYS
    .map((k) => ({ key: k, over: -remaining[k] / Math.max(1, goals[k]) }))
    .reduce((a, b) => (a.over > b.over ? a : b))

  if (biggestDeficit.pctRemaining < 0.2 && biggestExcess.over < 0.15) {
    return null
  }

  // If a non-calorie macro is over its goal by more than the biggest
  // deficit, the more useful comment is the excess. Otherwise focus on the
  // deficit.
  const focusMacro: MacroKey =
    biggestExcess.key !== 'calories' &&
    biggestExcess.over > biggestDeficit.pctRemaining
      ? biggestExcess.key
      : biggestDeficit.key

  const timeOfDay = timeOfDayLabel(ctx.now)
  const mealsRemaining = mealsRemainingForTimeOfDay(entries, ctx.now)

  const recentEntries = summarizeRecentEntries(entries, 5)
  const topFoods = await candidateFoodsForMacro(focusMacro, 15)

  const slice: Record<string, unknown> = {
    time_of_day: timeOfDay,
    meals_remaining: mealsRemaining,
    goals,
    totals: roundMacros(totals),
    remaining: roundMacros(remaining),
    focus_macro: focusMacro,
    focus_remaining: Math.round(remaining[focusMacro]),
    focus_pct_of_goal_remaining: Math.round(macroPct(focusMacro) * 100),
    recent_entries: recentEntries,
    // Candidate foods from the user's library, ranked by how much of the
    // focus macro they contribute per serving. Cheesecake fills a protein
    // gap poorly; the ranking already accounts for that.
    top_foods_for_focus: topFoods,
  }

  const promptHint =
    focusMacro === biggestExcess.key
      ? `The user just logged a meal. They're over their ${focusMacro} target for the day. Given the time of day and remaining meals, is there a specific move worth flagging? If not, respond NONE.`
      : `The user just logged a meal. They're behind on ${focusMacro} — about ${Math.round(macroPct(focusMacro) * 100)}% of the daily goal still to hit, with ${mealsRemaining.length} meal(s) left. Suggest a specific move using foods from their library. If nothing useful, respond NONE.`

  return [
    {
      subjectKey: focusMacro,
      // notable — worth acting on today, but not urgent (no push).
      severity: 'notable',
      slice,
      promptHint,
    },
  ]
}

// ---- food_sanity ----
//
// Fires on-write when a food is added or updated. Catches silent data-entry
// errors that would otherwise quietly corrupt macro tracking for months:
//   (a) The calorie total doesn't match 4p+4c+9f (typo or wrong unit)
//   (b) Per-100g values entered as per-serving (heuristic: kcal/g > ~9.5,
//       which is above pure fat)
//
// Scans all foods and returns one TriggerResult per problematic food. The
// engine's inputHash + subjectKey dedupe means a fixed food doesn't re-fire.

function foodSanityIssues(food: Food): {
  calorieMismatch: boolean
  perServingSuspect: boolean
  calcCalories: number
  deviationPct: number
  kcalPerGram: number | null
} | null {
  const { calories, protein, carbs, fat } = food.macros
  const calcCalories = 4 * protein + 4 * carbs + 9 * fat
  // Skip trivially small values — a 5-kcal condiment can mathematically look
  // off by 40% without being a real error.
  const deviationPct =
    calories >= 30
      ? (Math.abs(calories - calcCalories) / Math.max(1, calories)) * 100
      : 0
  const calorieMismatch = deviationPct > 15

  // 9.5 kcal/g is the ceiling — pure fat is 9. Anything above suggests the
  // grams field is wrong (or macros are per-100g while serving_grams is
  // much smaller). Only checkable when servingGrams is set.
  const kcalPerGram =
    food.servingGrams && food.servingGrams > 0
      ? calories / food.servingGrams
      : null
  const perServingSuspect = kcalPerGram !== null && kcalPerGram > 9.5

  if (!calorieMismatch && !perServingSuspect) return null
  return { calorieMismatch, perServingSuspect, calcCalories, deviationPct, kcalPerGram }
}

async function checkFoodSanity(
  _ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const foods = await db.foods.toArray()
  const results: TriggerResult[] = []
  for (const food of foods) {
    if (food.id === undefined) continue
    const issues = foodSanityIssues(food)
    if (!issues) continue

    const slice: Record<string, unknown> = {
      food_name: food.name,
      brand: food.brand ?? null,
      serving_size: food.servingSize,
      serving_grams: food.servingGrams ?? null,
      macros: {
        calories: Math.round(food.macros.calories),
        protein: Math.round(food.macros.protein * 10) / 10,
        carbs: Math.round(food.macros.carbs * 10) / 10,
        fat: Math.round(food.macros.fat * 10) / 10,
      },
      calories_from_macros: Math.round(issues.calcCalories),
      calorie_deviation_pct: Math.round(issues.deviationPct),
      kcal_per_gram: issues.kcalPerGram
        ? Math.round(issues.kcalPerGram * 10) / 10
        : null,
      issues_detected: [
        issues.calorieMismatch ? 'calorie_math_mismatch' : null,
        issues.perServingSuspect ? 'kcal_per_gram_above_pure_fat' : null,
      ].filter(Boolean),
    }

    const promptHint = `The user just added or edited a food in their library and the numbers look off. Point out the specific issue (calorie math doesn't add up, or serving grams look wrong) in one sentence with the exact numbers. Suggest what to check. Don't lecture. If nothing's really wrong, respond NONE.`

    results.push({
      subjectKey: String(food.id),
      // notable — the user should fix this, but nothing is urgent.
      severity: 'notable',
      slice,
      promptHint,
    })
  }

  return results.length > 0 ? results : null
}

// ---- workout_verdict ----
//
// Fires on-write when a workout gets `completedAt` set (WorkoutSession's
// Finish button). Identifies the just-finished workout by scanning for
// workouts completed within the last minute — the on_write fire is
// synchronous with the completion so this is safe.

async function checkWorkoutVerdict(
  _ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const cutoff = Date.now() - 60_000
  const recent = (await db.workouts.toArray()).filter(
    (w) => w.completedAt !== undefined && w.completedAt >= cutoff,
  )
  if (recent.length === 0) return null
  // Newest first — should be at most one in practice.
  recent.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const w = recent[0]
  if (w.id === undefined) return null

  // Previous session with the same template name — that's what we compare
  // against. Falls back to null if this is the first time doing this template.
  const prevCandidates = (await db.workouts.toArray()).filter(
    (o) => o.completedAt !== undefined && o.name === w.name && o.id !== w.id,
  )
  prevCandidates.sort((a, b) => b.date - a.date)
  const prev = prevCandidates[0]

  const summarizeExercises = (workout: typeof w) =>
    workout.exercises
      .map((ex) => {
        const done = ex.sets.filter(isSetCompleted)
        if (done.length === 0) return null
        // Top set by weight × reps (rough tonnage per set).
        const top = done.reduce((a, b) =>
          a.weight * a.reps >= b.weight * b.reps ? a : b,
        )
        return {
          name: ex.exerciseName,
          set_count: done.length,
          top_set: {
            reps: top.reps,
            weight: top.weight,
            rpe: top.rpe ?? null,
          },
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

  const currVol = Math.round(totalVolume(w))
  const currReps = totalReps(w)

  const slice: Record<string, unknown> = {
    workout: {
      name: w.name,
      duration_min: w.durationSec ? Math.round(w.durationSec / 60) : null,
      volume_lb: currVol,
      total_reps: currReps,
      exercises: summarizeExercises(w),
    },
    previous_session: prev
      ? {
          days_ago: Math.max(
            1,
            Math.round((w.date - prev.date) / 86_400_000),
          ),
          duration_min: prev.durationSec
            ? Math.round(prev.durationSec / 60)
            : null,
          volume_lb: Math.round(totalVolume(prev)),
          total_reps: totalReps(prev),
          exercises: summarizeExercises(prev),
        }
      : null,
    volume_delta_lb: prev ? currVol - Math.round(totalVolume(prev)) : null,
    reps_delta: prev ? currReps - totalReps(prev) : null,
  }

  const promptHint = prev
    ? `The user just finished a ${w.name} workout. Give a short verdict comparing to their previous ${w.name} session. Call out PRs, top-set changes, and volume/rep deltas with exact numbers. If nothing changed meaningfully, respond NONE.`
    : `The user just finished a ${w.name} workout — first time doing this template. Give a short baseline verdict, calling out the strongest lifts with exact top sets. If nothing worth flagging, respond NONE.`

  return [
    {
      subjectKey: `workout:${w.id}`,
      severity: 'notable',
      slice,
      promptHint,
    },
  ]
}

// ---- lift_stalled ----
//
// Scans every exercise the user has done 3+ times. Flags when the top-set
// weight has been identical for the last 3 sessions OR when top-set reps
// have declined for 2 sessions in a row. One TriggerResult per stalled
// exercise; the engine's inputHash dedupe handles per-exercise re-fire.

async function checkLiftStalled(
  _ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const allWorkouts = (await db.workouts.toArray()).filter(
    (w) => w.completedAt !== undefined,
  )
  const exercises = await db.exercises.toArray()
  const results: TriggerResult[] = []

  for (const ex of exercises) {
    if (ex.id === undefined) continue
    const sessions = exerciseSessions(allWorkouts, ex.id)
    if (sessions.length < 3) continue

    const last3 = sessions.slice(0, 3)
    const weightStalled = last3.every(
      (s) => s.topSet.weight === last3[0].topSet.weight,
    )
    // Reps down in two consecutive sessions (three sessions total: newest,
    // middle, older-than-middle where newest < middle < older).
    const repsDown =
      sessions.length >= 3 &&
      sessions[0].topSet.reps < sessions[1].topSet.reps &&
      sessions[1].topSet.reps < sessions[2].topSet.reps

    if (!weightStalled && !repsDown) continue

    // Rep range prescription from the program (may not have one).
    const programSlot = PROGRAM.flatMap((d) => d.slots).find(
      (s) => s.name === ex.name,
    )

    const slice: Record<string, unknown> = {
      exercise_name: ex.name,
      pattern: weightStalled
        ? 'top_weight_unchanged_3_sessions'
        : 'top_reps_declined_2_sessions',
      last_sessions: sessions.slice(0, 8).map((s) => ({
        days_ago: Math.max(0, Math.round((Date.now() - s.date) / 86_400_000)),
        top_reps: s.topSet.reps,
        top_weight: s.topSet.weight,
        top_e1rm: Math.round(s.topE1RM),
      })),
      programmed_rep_range: programSlot
        ? {
            low: programSlot.repLow ?? null,
            high: programSlot.repHigh ?? null,
            sets: programSlot.sets,
          }
        : null,
    }

    const promptHint = `The user's ${ex.name} has stalled: ${
      weightStalled
        ? 'same top weight for 3 sessions in a row'
        : 'top reps declined 2 sessions in a row'
    }. Suggest one specific move — add reps at the same weight, deload ~10%, swap for an alternative, or take a rest week. Use exact numbers from their history.`

    results.push({
      subjectKey: `exercise:${ex.id}`,
      severity: 'notable',
      slice,
      promptHint,
    })
  }

  return results.length > 0 ? results : null
}

// ---- fatigue_interpret ----
//
// If any muscle group is above 80% fatigue AND today's or tomorrow's
// programmed session hits it, describe the conflict. Uses the deterministic
// computeFatigue / rankFatigue helpers so the model doesn't have to guess.

async function checkFatigueInterpret(
  ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const allWorkouts = (await db.workouts.toArray()).filter(
    (w) => w.completedAt !== undefined,
  )
  if (allWorkouts.length === 0) return null

  const exercises = await db.exercises.toArray()
  const exLib = new Map(
    exercises
      .filter((e): e is typeof e & { id: number } => e.id !== undefined)
      .map((e) => [e.id, e]),
  )

  const fatigue = computeFatigue(allWorkouts, exLib)
  const overheated = rankFatigue(fatigue).filter((r) => r.pct > 80)
  if (overheated.length === 0) return null

  // Which template is next? Today, else tomorrow. If both are rest, no
  // conflict to flag.
  let session = todaysLift(ctx.now)
  let dayLabel: 'today' | 'tomorrow' = 'today'
  if (!session) {
    const tomorrow = new Date(ctx.now.getTime() + 86_400_000)
    session = todaysLift(tomorrow)
    dayLabel = 'tomorrow'
  }
  if (!session) return null

  const dayPlan = PROGRAM.find((d) => d.key === session!.key)
  if (!dayPlan) return null

  const hitGroups = new Set<string>()
  for (const slot of dayPlan.slots) {
    for (const mg of slot.muscleGroups) hitGroups.add(mg)
  }

  const conflicts = overheated.filter((r) => hitGroups.has(r.group))
  if (conflicts.length === 0) return null

  // Last 3 nights of sleep, if any logged. Model uses it to weigh advice.
  const dayMs = 86_400_000
  const threeDaysAgo = ctx.today - 3 * dayMs
  const sleepLogs = await db.health_logs
    .where('[date+type]')
    .between([threeDaysAgo, 'sleep'], [ctx.today, 'sleep'], true, true)
    .toArray()

  const slice: Record<string, unknown> = {
    conflict_groups: conflicts.map((c) => ({
      group: MUSCLE_LABELS[c.group],
      fatigue_pct: c.pct,
      estimated_recovery_days: recoveryDays(c.pct),
    })),
    upcoming_session: {
      name: session.templateName,
      day: dayLabel,
      hits_groups: Array.from(hitGroups)
        .filter((g): g is MuscleGroup => g in MUSCLE_LABELS)
        .map((g) => MUSCLE_LABELS[g]),
    },
    recent_sleep_hours: sleepLogs
      .sort((a, b) => a.date - b.date)
      .map((l) => ({
        days_ago: Math.round((ctx.today - l.date) / dayMs),
        hours: l.value,
      })),
  }

  const promptHint = `The user has a fatigue conflict: ${conflicts
    .map((c) => `${MUSCLE_LABELS[c.group]} at ${c.pct}%`)
    .join(', ')}, with ${session.templateName} scheduled ${dayLabel}. Suggest one specific move — swap the session, deload volume on the conflicting lifts, take a rest day. If ambiguous, respond NONE.`

  return [
    {
      // One insight per unique combo of conflicting groups.
      subjectKey: conflicts
        .map((c) => c.group)
        .sort()
        .join(','),
      severity: 'notable',
      slice,
      promptHint,
    },
  ]
}

// ---- sleep_before_heavy ----
//
// Two nights under 6.5h AND today's programmed session contains a compound
// barbell lift. Bar speed / technique degrade meaningfully at this sleep
// debt on compounds — worth surfacing.

// Compound barbell lifts from the STARTER_EXERCISES set + PROGRAM main lifts.
// Anything not in this list is treated as an accessory (no warning triggered).
const COMPOUND_LIFTS = new Set([
  'Bench Press',
  'Back Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Trap Bar Deadlift',
  'Romanian Deadlift',
  'Front Squat',
  'Hip Thrust',
])

async function checkSleepBeforeHeavy(
  ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const dayMs = 86_400_000
  const lastNightKey = ctx.today - dayMs
  const twoNightsAgoKey = ctx.today - 2 * dayMs

  const sleepLogs = await db.health_logs
    .where('type')
    .equals('sleep')
    .toArray()
  const lastNight = sleepLogs.find((l) => l.date === lastNightKey)
  const twoNightsAgo = sleepLogs.find((l) => l.date === twoNightsAgoKey)
  if (!lastNight || !twoNightsAgo) return null
  if (lastNight.value >= 6.5 || twoNightsAgo.value >= 6.5) return null

  const today = todaysLift(ctx.now)
  if (!today) return null // rest day
  const dayPlan = PROGRAM.find((d) => d.key === today.key)
  if (!dayPlan) return null
  const compounds = dayPlan.slots.filter((s) => COMPOUND_LIFTS.has(s.name))
  if (compounds.length === 0) return null

  // Last performance on each compound (best set on record).
  const allWorkouts = (await db.workouts.toArray()).filter(
    (w) => w.completedAt !== undefined,
  )
  const exercises = await db.exercises.toArray()
  const lastPerformance: Record<
    string,
    { top_weight: number; top_reps: number; e1rm: number; days_ago: number }
  > = {}
  for (const c of compounds) {
    const ex = exercises.find((e) => e.name === c.name)
    if (!ex?.id) continue
    const best = bestSetForExercise(allWorkouts, ex.id)
    if (best) {
      lastPerformance[c.name] = {
        top_weight: best.weight,
        top_reps: best.reps,
        e1rm: Math.round(best.e1rm),
        days_ago: Math.max(
          0,
          Math.round((Date.now() - best.date) / dayMs),
        ),
      }
    }
  }

  const slice: Record<string, unknown> = {
    last_2_nights_sleep: [
      { night: 'last night', hours: lastNight.value },
      { night: '2 nights ago', hours: twoNightsAgo.value },
    ],
    todays_session: today.templateName,
    compound_lifts_programmed: compounds.map((c) => c.name),
    best_performance_on_compounds: lastPerformance,
  }

  const promptHint = `The user slept ${lastNight.value}h and ${twoNightsAgo.value}h the last two nights (both under 6.5h) and today's ${today.templateName} programs compound lifts (${compounds.map((c) => c.name).join(', ')}). Bar speed and technique degrade meaningfully at this sleep debt. Suggest one specific adjustment: cap intensity, accessories only, swap the session. Use exact numbers.`

  return [
    {
      // One per (day, session) so the same warning doesn't refire tomorrow
      // if the same conditions persist — new date, new subjectKey.
      subjectKey: `${ctx.today}:${today.key}`,
      severity: 'notable',
      slice,
      promptHint,
    },
  ]
}

// ---- tdee_drift ----
//
// Scheduled trigger. Compares the user's implied TDEE (from weight trend +
// average intake over 14+ days) against their configured calorie goal.
// If they're off by more than 10%, flag it — that's usually the sign that
// the calorie target needs re-tuning.
//
// Requires both 14+ days of weight logs AND 14+ days of meal_entries
// covering the same window. Silent otherwise.

async function checkTdeeDrift(
  ctx: TriggerContext,
): Promise<TriggerResult[] | null> {
  const dayMs = 86_400_000
  const windowStart = ctx.today - 13 * dayMs // 14 day window incl today

  // Weight logs over the window, sorted by date.
  const weightLogs = (
    await db.health_logs
      .where('[date+type]')
      .between([windowStart, 'weight'], [ctx.today, 'weight'], true, true)
      .toArray()
  ).sort((a, b) => a.date - b.date)
  if (weightLogs.length < 4) return null // need enough anchors for a trend

  // Meal entries over the window. Compute per-day calorie totals.
  const meals = await db.meal_entries
    .where('date')
    .between(windowStart, ctx.today, true, true)
    .toArray()
  const dayCalories = new Map<number, number>()
  for (const m of meals) {
    dayCalories.set(m.date, (dayCalories.get(m.date) ?? 0) + m.macros.calories)
  }
  if (dayCalories.size < 10) return null // sparsely logged; TDEE math is noise

  // Weekly weight averages — first ~7 days vs last ~7 days — smooths daily
  // fluctuation (water, timing) that would otherwise dominate the delta.
  const mid = windowStart + 6 * dayMs
  const firstHalf = weightLogs.filter((w) => w.date <= mid).map((w) => w.value)
  const secondHalf = weightLogs.filter((w) => w.date > mid).map((w) => w.value)
  if (firstHalf.length === 0 || secondHalf.length === 0) return null
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const firstAvg = avg(firstHalf)
  const secondAvg = avg(secondHalf)
  const weightDeltaLb = secondAvg - firstAvg
  const daysBetween = 7 // midpoint-to-midpoint approximation

  // 1 lb body-weight change ≈ 3500 kcal. Positive delta = user is gaining,
  // meaning intake > TDEE.
  const kcalSurplusPerDay = (weightDeltaLb * 3500) / daysBetween
  const totalCalories = Array.from(dayCalories.values()).reduce(
    (s, x) => s + x,
    0,
  )
  const daysLogged = dayCalories.size
  const avgIntake = totalCalories / daysLogged
  const impliedTdee = avgIntake - kcalSurplusPerDay

  const calorieGoal = await getMacroGoal('calories')
  const drift = impliedTdee - calorieGoal
  const driftPct = Math.abs(drift) / calorieGoal
  if (driftPct < 0.1) return null

  const slice: Record<string, unknown> = {
    window_days: 14,
    days_of_weight_logs: weightLogs.length,
    days_of_calorie_logs: daysLogged,
    weight: {
      first_half_avg_lb: Math.round(firstAvg * 10) / 10,
      second_half_avg_lb: Math.round(secondAvg * 10) / 10,
      change_lb: Math.round(weightDeltaLb * 10) / 10,
    },
    avg_daily_intake_kcal: Math.round(avgIntake),
    implied_tdee_kcal: Math.round(impliedTdee),
    configured_calorie_goal: calorieGoal,
    drift_kcal: Math.round(drift),
    drift_pct: Math.round(driftPct * 100),
    direction:
      drift > 0
        ? 'implied_tdee_higher_than_goal'
        : 'implied_tdee_lower_than_goal',
  }

  const promptHint = `The user's weight and macro logs from the last 14 days imply a TDEE ~${Math.abs(Math.round(drift))} kcal ${drift > 0 ? 'higher' : 'lower'} than their configured calorie goal of ${calorieGoal}. That's a ${Math.round(driftPct * 100)}% drift. Explain the math briefly and suggest they either adjust the goal or accept the current pace. Use the exact numbers.`

  return [
    {
      // Only one per period — no meaningful subjectKey; the inputHash + the
      // 24h ttl handles cooldown.
      subjectKey: 'tdee',
      severity: 'notable',
      slice,
      promptHint,
    },
  ]
}

export const TRIGGERS: Trigger[] = [
  {
    id: 'macro_gap',
    coach: 'macros',
    surface: 'macros_header',
    model: 'haiku',
    cadence: 'on_write',
    // Dismissing a protein gap at lunch shouldn't resurface for a few hours;
    // after that a new state may warrant a fresh look.
    ttlHours: 4,
    check: checkMacroGap,
  },
  {
    id: 'food_sanity',
    coach: 'macros',
    surface: 'macros_header',
    model: 'haiku',
    cadence: 'on_write',
    // Once dismissed, don't re-fire on the same food for a week. If the user
    // edits the food to change the macros, the inputHash changes anyway and
    // a new insight can fire.
    ttlHours: 24 * 7,
    check: checkFoodSanity,
  },
  {
    id: 'workout_verdict',
    coach: 'fitness',
    surface: 'fitness_top',
    // Sonnet — comparison + numeric reasoning benefits from more capability
    // than the two-sentence macros nudges.
    model: 'sonnet',
    cadence: 'on_write',
    // One verdict per workout; workoutId in subjectKey means each finish
    // gets its own regardless of dismissal history.
    ttlHours: 24,
    check: checkWorkoutVerdict,
  },
  {
    id: 'lift_stalled',
    coach: 'fitness',
    surface: 'fitness_top',
    model: 'sonnet',
    cadence: 'scheduled',
    // Roughly one workout cycle — long enough that the user has a chance to
    // act before the same insight resurfaces.
    ttlHours: 24 * 3,
    check: checkLiftStalled,
  },
  {
    id: 'fatigue_interpret',
    coach: 'fitness',
    surface: 'fitness_fatigue',
    model: 'sonnet',
    cadence: 'scheduled',
    ttlHours: 24,
    check: checkFatigueInterpret,
  },
  {
    id: 'sleep_before_heavy',
    coach: 'fitness',
    surface: 'fitness_top',
    model: 'sonnet',
    cadence: 'scheduled',
    ttlHours: 24,
    check: checkSleepBeforeHeavy,
  },
  {
    id: 'tdee_drift',
    coach: 'health',
    surface: 'home_top',
    // Sonnet — the drift math is small but the recommendation ("adjust
    // goal by ~200 kcal" vs "your logging is too sparse to trust this
    // yet") benefits from more capability than a Haiku pattern-match.
    model: 'sonnet',
    cadence: 'scheduled',
    ttlHours: 24 * 3,
    check: checkTdeeDrift,
  },
]

// ---- Helpers ----

function timeOfDayLabel(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'late night'
  if (h < 11) return 'morning'
  if (h < 14) return 'midday'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'late night'
}

function mealsRemainingForTimeOfDay(
  entries: MealEntry[],
  now: Date,
): string[] {
  // Rough windows — the point is to give the model an idea of what meals
  // are still on the table, not to be authoritative about when someone
  // "should" eat lunch.
  const h = now.getHours()
  const loggedTypes = new Set(entries.map((e) => e.type))
  const remaining: string[] = []
  for (const meal of MEAL_ORDER) {
    if (loggedTypes.has(meal)) continue
    // Assume any un-logged meal in the remainder of the day is still on
    // the table unless we're past its typical window and it's clearly been
    // skipped.
    if (meal === 'breakfast' && h >= 11) continue
    if (meal === 'lunch' && h >= 15) continue
    if (meal === 'dinner' && h >= 21) continue
    remaining.push(meal)
  }
  return remaining
}

function roundMacros(m: {
  calories: number
  protein: number
  carbs: number
  fat: number
}) {
  return {
    calories: Math.round(m.calories),
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fat: Math.round(m.fat),
  }
}

function summarizeRecentEntries(entries: MealEntry[], n: number) {
  // Newest first. Strip timestamps, ids — anything the model doesn't need
  // and that would bust the inputHash unnecessarily.
  return [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, n)
    .map((e) => ({
      meal: e.type,
      food: e.foodName,
      servings: e.servings,
      calories: Math.round(e.macros.calories),
      protein: Math.round(e.macros.protein),
      carbs: Math.round(e.macros.carbs),
      fat: Math.round(e.macros.fat),
    }))
}

async function candidateFoodsForMacro(macro: MacroKey, n: number) {
  const foods = await db.foods.toArray()
  return foods
    .filter((f) => (f.macros[macro] ?? 0) > 0)
    // Rank by focus-macro amount per serving. For calories we still want
    // "densest" foods first (usually not what the user needs — the model
    // uses this only when calories is somehow the focus macro).
    .sort((a, b) => (b.macros[macro] ?? 0) - (a.macros[macro] ?? 0))
    .slice(0, n)
    .map((f) => ({
      name: f.name,
      serving: f.servingSize,
      calories: Math.round(f.macros.calories),
      protein: Math.round(f.macros.protein),
      carbs: Math.round(f.macros.carbs),
      fat: Math.round(f.macros.fat),
    }))
}

// Used by engine to seed the ctx quickly.
export function makeContext(): TriggerContext {
  return { now: new Date(), today: startOfToday() }
}
