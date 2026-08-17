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
import type { InsightCoach, InsightSeverity, MealEntry } from '../../db/types'
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
