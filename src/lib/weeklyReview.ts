import { db, getSetting } from '../db'
import { formatDuration, totalReps, totalVolume } from './fitness'
import { formatDeadline, TERM_LABELS } from './goals'
import { MACRO_GOALS, sumMacros } from './macros'
import { startOfToday } from './health'

const WEEK_MS = 7 * 86_400_000

// Stable key for the cached weekly review — one per ISO date of the week start.
export function weekStartKey(d: Date = new Date()): string {
  const today = startOfToday()
  const start = today - 6 * 86_400_000
  return new Date(start).toISOString().slice(0, 10)
}

export const WEEKLY_REVIEW_SYSTEM_PROMPT = `You are Alfred, the head butler of LifeOS. You see one week of the user's data across fitness, macros, habits, tasks, health metrics, and goals. Your job: write a tight, useful weekly review.

## Hard rules

1. **Never fabricate.** Use only the data block below. If something is missing, say "no data" — don't guess.
2. **Be specific.** Quote real numbers, dates, exercise names, food names. Avoid generic encouragement.
3. **Find the signal.** Look for cross-cutting patterns ("you skipped legs the week your sleep dropped under 6 h"). Don't just restate each section.
4. **Be honest.** If the week was bad, say so. If goals slipped, name them. No empty hype.
5. **Stay short.** Total review under 350 words. Headers and short bullets, not paragraphs.

## Persona — English butler

Speak as a proper English butler. Address the user as "sir" once, near the start. Be measured, dry, occasionally wry. No "great job!" or "keep it up!" filler.

## Output format

Use these sections (skip any with no data):

**The week at a glance** — 1 line, the headline.
**Body** — workouts (count, volume, any PRs) + macros (avg cals/protein, % of goal hit).
**Mind & recovery** — sleep avg, mood/energy if logged, water consistency.
**Habits & tasks** — what stuck, what slipped.
**Goals** — progress notes, anything overdue.
**For next week** — 2-3 concrete suggestions tied to what you saw.

Markdown is fine. No closing pleasantries.`

// Build the user-message data block. The system prompt above sets the rules.
export async function buildWeeklyReviewUserMessage(): Promise<string> {
  const today = startOfToday()
  const weekAgo = today - 6 * 86_400_000
  const dayMs = 86_400_000

  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

  /* Fitness */
  const allWorkouts = await db.workouts.orderBy('date').reverse().toArray()
  const weekWorkouts = allWorkouts.filter(
    (w) => w.completedAt !== undefined && w.date >= weekAgo,
  )
  const priorWorkouts = allWorkouts.filter(
    (w) =>
      w.completedAt !== undefined &&
      w.date >= weekAgo - WEEK_MS &&
      w.date < weekAgo,
  )

  let fitnessBlock = '## Fitness — last 7 days\n'
  if (weekWorkouts.length === 0) {
    fitnessBlock += '(no workouts logged this week)\n'
  } else {
    const totalVol = weekWorkouts.reduce((s, w) => s + totalVolume(w), 0)
    const totalRep = weekWorkouts.reduce((s, w) => s + totalReps(w), 0)
    fitnessBlock += `- ${weekWorkouts.length} workouts, ${Math.round(totalVol).toLocaleString()} lb total volume, ${totalRep} reps\n`
    for (const w of weekWorkouts) {
      const dur = w.durationSec ? `, ${formatDuration(w.durationSec)}` : ''
      fitnessBlock += `  - ${fmt(w.date)} ${w.name}: ${w.exercises.length} ex, ${Math.round(totalVolume(w))} lb${dur}\n`
    }
    if (priorWorkouts.length > 0) {
      const priorVol = priorWorkouts.reduce((s, w) => s + totalVolume(w), 0)
      fitnessBlock += `- Prior week: ${priorWorkouts.length} workouts, ${Math.round(priorVol).toLocaleString()} lb (delta ${Math.round(totalVol - priorVol).toLocaleString()} lb)\n`
    }
  }

  /* Macros */
  const weekMeals = await db.meal_entries
    .where('date')
    .between(weekAgo, today, true, true)
    .toArray()
  const calorieGoal =
    (await getSetting<number>(MACRO_GOALS.calories.settingKey)) ??
    MACRO_GOALS.calories.default
  const proteinGoal =
    (await getSetting<number>(MACRO_GOALS.protein.settingKey)) ??
    MACRO_GOALS.protein.default

  let macrosBlock = '## Macros — last 7 days\n'
  if (weekMeals.length === 0) {
    macrosBlock += '(nothing logged this week)\n'
  } else {
    const dayBuckets = new Map<number, typeof weekMeals>()
    for (const m of weekMeals) {
      const arr = dayBuckets.get(m.date) ?? []
      arr.push(m)
      dayBuckets.set(m.date, arr)
    }
    const dailyTotals = Array.from(dayBuckets.entries()).map(([date, meals]) => ({
      date,
      ...sumMacros(meals),
    }))
    const days = dailyTotals.length || 1
    const avg = {
      calories: dailyTotals.reduce((s, t) => s + t.calories, 0) / days,
      protein: dailyTotals.reduce((s, t) => s + t.protein, 0) / days,
      carbs: dailyTotals.reduce((s, t) => s + t.carbs, 0) / days,
      fat: dailyTotals.reduce((s, t) => s + t.fat, 0) / days,
    }
    const proteinHits = dailyTotals.filter((t) => t.protein >= proteinGoal).length
    const calHits = dailyTotals.filter(
      (t) => Math.abs(t.calories - calorieGoal) <= 200,
    ).length
    macrosBlock += `- ${days} of 7 days logged\n`
    macrosBlock += `- Average per logged day: ${Math.round(avg.calories)} kcal · P${Math.round(avg.protein)}g · C${Math.round(avg.carbs)}g · F${Math.round(avg.fat)}g\n`
    macrosBlock += `- Goals: ${calorieGoal} kcal, ${proteinGoal}g protein\n`
    macrosBlock += `- Days within ±200 of calorie goal: ${calHits}/${days}\n`
    macrosBlock += `- Days hitting protein goal: ${proteinHits}/${days}\n`
  }

  /* Health metrics */
  const weekHealth = await db.health_logs
    .where('date')
    .between(weekAgo, today, true, true)
    .toArray()

  const byType = (t: string) => weekHealth.filter((l) => l.type === t)
  const sleepLogs = byType('sleep')
  const waterLogs = byType('water')
  const moodLogs = byType('mood')
  const energyLogs = byType('energy')
  const weightLogs = byType('weight').sort((a, b) => a.date - b.date)

  let healthBlock = '## Health — last 7 days\n'
  const avgOf = (xs: typeof weekHealth) =>
    xs.length ? xs.reduce((s, l) => s + l.value, 0) / xs.length : null

  const sleepAvg = avgOf(sleepLogs)
  const waterAvg = avgOf(waterLogs)
  const moodAvg = avgOf(moodLogs)
  const energyAvg = avgOf(energyLogs)

  if (sleepAvg !== null) healthBlock += `- Sleep avg: ${sleepAvg.toFixed(1)} h (${sleepLogs.length} nights)\n`
  if (waterAvg !== null) healthBlock += `- Water avg: ${waterAvg.toFixed(2)} L/day (${waterLogs.length} days logged)\n`
  if (moodAvg !== null) healthBlock += `- Mood avg: ${moodAvg.toFixed(1)}/10 (${moodLogs.length} entries)\n`
  if (energyAvg !== null) healthBlock += `- Energy avg: ${energyAvg.toFixed(1)}/10 (${energyLogs.length} entries)\n`
  if (weightLogs.length >= 2) {
    const start = weightLogs[0].value
    const end = weightLogs[weightLogs.length - 1].value
    const delta = end - start
    healthBlock += `- Weight: ${start.toFixed(1)} → ${end.toFixed(1)} lb (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} lb)\n`
  } else if (weightLogs.length === 1) {
    healthBlock += `- Weight: ${weightLogs[0].value.toFixed(1)} lb (single reading)\n`
  }
  if (sleepAvg === null && waterAvg === null && moodAvg === null && energyAvg === null && weightLogs.length === 0) {
    healthBlock += '(no health metrics logged this week)\n'
  }

  // Per-day sleep + mood + energy details for cross-cutting analysis
  const dailyDetails: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = today - i * dayMs
    const s = sleepLogs.find((l) => l.date === d)
    const m = moodLogs.find((l) => l.date === d)
    const e = energyLogs.find((l) => l.date === d)
    const w = waterLogs.find((l) => l.date === d)
    if (!s && !m && !e && !w) continue
    const parts: string[] = []
    if (s) parts.push(`sleep ${s.value}h`)
    if (m) parts.push(`mood ${m.value}/10`)
    if (e) parts.push(`energy ${e.value}/10`)
    if (w) parts.push(`water ${w.value.toFixed(2)}L`)
    dailyDetails.push(`  - ${fmt(d)}: ${parts.join(', ')}`)
  }
  if (dailyDetails.length > 0) {
    healthBlock += `- Daily breakdown:\n${dailyDetails.join('\n')}\n`
  }

  /* Habits — pull the trailing week's entries per habit rather than the old
     history[] field. Denominator is 7 for daily/perWeek, or the count of
     scheduled days that actually fell in the window for weekdays. */
  const habits = (await db.habits.toArray()).filter((h) => !h.archivedAt)
  let habitsBlock = '## Habits\n'
  if (habits.length === 0) {
    habitsBlock += '(no habits set up)\n'
  } else {
    for (const h of habits) {
      const weekEntries = await db.habit_entries
        .where('habitId')
        .equals(h.id!)
        .and((e) => e.date >= weekAgo && e.date < today + dayMs)
        .toArray()
      const hits = weekEntries.filter(
        (e) => e.value >= (e.target || 1),
      ).length
      let denom = 7
      if (h.schedule?.mode === 'weekdays') {
        denom = 0
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekAgo + i * dayMs).getDay()
          if (h.schedule.days.includes(d)) denom++
        }
      } else if (h.schedule?.mode === 'perWeek') {
        denom = h.schedule.perWeek
      }
      habitsBlock += `- ${h.name}: ${hits}/${denom} this week, current streak ${h.streak}d (longest ${h.longestStreak}d)\n`
    }
  }

  /* Tasks */
  const allTasks = await db.tasks
    .where('createdAt')
    .aboveOrEqual(weekAgo)
    .toArray()
  // tasks.completedAt isn't indexed, so query by the indexed `status` field
  // and filter the date in JS.
  const completedTasksAll = await db.tasks
    .where('status')
    .equals('completed')
    .toArray()
  const completedThisWeek = completedTasksAll.filter(
    (t) => t.completedAt !== undefined && t.completedAt >= weekAgo,
  )
  const stillOpen = allTasks.filter((t) => t.status !== 'completed')
  let tasksBlock = '## Tasks — this week\n'
  if (allTasks.length === 0 && completedThisWeek.length === 0) {
    tasksBlock += '(none)\n'
  } else {
    tasksBlock += `- Completed: ${completedThisWeek.length}\n`
    if (completedThisWeek.length > 0) {
      for (const t of completedThisWeek.slice(0, 8)) {
        tasksBlock += `  - ✓ ${t.title}\n`
      }
    }
    if (stillOpen.length > 0) {
      tasksBlock += `- Still open from this week: ${stillOpen.length}\n`
      for (const t of stillOpen.slice(0, 5)) {
        tasksBlock += `  - ◯ ${t.title}\n`
      }
    }
  }

  /* Goals */
  const goals = await db.goals.toArray()
  const active = goals.filter((g) => g.status === 'active')
  const completedThisWeekGoals = goals.filter(
    (g) =>
      g.status === 'completed' &&
      g.completedAt !== undefined &&
      g.completedAt >= weekAgo,
  )
  // Recent journal entries for active goals (anything from this week)
  const journal = await db.goal_journal
    .where('createdAt')
    .aboveOrEqual(weekAgo)
    .toArray()
  const journalByGoal = new Map<number, typeof journal>()
  for (const j of journal) {
    const arr = journalByGoal.get(j.goalId) ?? []
    arr.push(j)
    journalByGoal.set(j.goalId, arr)
  }

  let goalsBlock = '## Goals\n'
  if (active.length === 0 && completedThisWeekGoals.length === 0) {
    goalsBlock += '(no active goals)\n'
  } else {
    if (completedThisWeekGoals.length > 0) {
      goalsBlock += `- Completed this week: ${completedThisWeekGoals.map((g) => g.title).join(', ')}\n`
    }
    for (const g of active) {
      const deadline = g.targetDate ? ` — ${formatDeadline(g.targetDate)}` : ''
      const overdue =
        g.targetDate !== undefined && g.targetDate < today ? ' [OVERDUE]' : ''
      goalsBlock += `- [${TERM_LABELS[g.term]}] ${g.title}${deadline}${overdue}\n`
      const entries = journalByGoal.get(g.id!) ?? []
      if (entries.length > 0) {
        for (const e of entries.slice(0, 3)) {
          goalsBlock += `  - journal ${fmt(e.createdAt)}: ${e.text}\n`
        }
      }
    }
  }

  const dateRange = `${fmt(weekAgo)} – ${fmt(today)}`
  return `Write the weekly review for ${dateRange}.

${fitnessBlock}
${macrosBlock}
${healthBlock}
${habitsBlock}
${tasksBlock}
${goalsBlock}`
}
