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
