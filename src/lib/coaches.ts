import { db, getSetting } from '../db'
import type { Workout } from '../db/types'
import { listEventsForRange } from './calendar'
import {
  bestSetForExercise,
  formatDuration,
  isSetCompleted,
  totalReps,
  totalVolume,
} from './fitness'
import { formatDeadline, TERM_LABELS } from './goals'
import {
  MACRO_GOALS,
  MEAL_LABELS,
  MEAL_ORDER,
  sumMacros,
} from './macros'
import { startOfToday, startOfWeek } from './health'

export type CoachKey = 'home' | 'fitness' | 'macros' | 'goals' | 'health'

// Model choices: pick what fits the task. Adaptive thinking is supported on
// Opus 4.6/4.7 and Sonnet 4.6. Haiku 4.5 does NOT support adaptive thinking,
// so leave thinking 'disabled' there.
export type CoachModel =
  | 'claude-opus-4-7'
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'

interface CoachConfig {
  conversationId: string
  label: string
  placeholder: string
  model: CoachModel
  thinking: 'adaptive' | 'disabled'
}

export const COACH_CONFIG: Record<CoachKey, CoachConfig> = {
  home: {
    conversationId: 'home',
    label: 'Alfred',
    placeholder: 'Ask Alfred…',
    model: 'claude-haiku-4-5',
    thinking: 'disabled',
  },
  fitness: {
    conversationId: 'fitness',
    label: 'Jarvis · Fitness coach',
    placeholder: 'Ask your fitness coach Jarvis…',
    model: 'claude-sonnet-4-6',
    thinking: 'adaptive',
  },
  macros: {
    conversationId: 'macros',
    label: 'Sebastian · Nutrition coach',
    placeholder: 'Ask your nutrition coach Sebastian…',
    model: 'claude-sonnet-4-6',
    thinking: 'adaptive',
  },
  goals: {
    conversationId: 'goals',
    label: 'Benson · Goals coach',
    placeholder: 'Ask your goals coach Benson…',
    model: 'claude-haiku-4-5',
    thinking: 'disabled',
  },
  health: {
    conversationId: 'health',
    label: 'Cornelius · Health coach',
    placeholder: 'Ask your health coach Cornelius…',
    model: 'claude-sonnet-4-6',
    thinking: 'adaptive',
  },
}

// Shared baseline every coach inherits. Sets behavior contract before the
// role-specific prompt and data block. Each coach prepends their own name in
// the role section since the names differ (Alfred / Jarvis / Sebastian / Benson).
// Exported so the passive-insight layer (lib/insights/generate.ts) can reuse
// the same persona and no-fabrication rules without duplicating them.
export const BASE_PROMPT = `You are an assistant inside LifeOS, a personal life-management app used by ONE user — the owner of this device. Everything you see is their actual logged data, and you're talking directly to them. Address them as "you" in your responses.

## Hard rules

1. **Never fabricate data.** If something isn't in the context provided, say "I don't have that data" instead of guessing. Don't invent specific numbers (weights, dates, calories, durations, etc.). No "you probably did about X" — either you have the value or you don't.
2. **Be specific when you DO have data.** Quote it directly: "your bench on March 15 was 5×185 lb", "you're at 1,820 / 2,200 calories with 380 to go." Use real names, dates, and numbers. Don't generalize over data you can see.
3. **Be direct and short.** Default 2-4 sentences for simple questions. No "I'd recommend you might consider" — just say it. No "feel free to" / "always remember to" filler.
4. **No empty motivation.** Don't say "great job!" or "keep it up!" Observe what's actually happening (good or bad) and respond to it.
5. **Acknowledge boundaries.** If the user asks about something outside your section's data, say so and point them to the right tab — don't try to answer with data you don't have.
6. **Default units:** lb for weight, kcal for energy, hours for sleep, L for water, minutes for duration. Match what the user uses.
7. **No reflexive disclaimers.** Skip "consult a professional" lines unless something is actually risky. Skip "everyone is different" hedges. Just answer the question.

## Style

- Markdown is fine but don't over-format. Lists and headers only when they actually help.
- For open-ended questions, give your real best answer — don't hedge with "it depends" unless the answer genuinely depends on missing info you should ask for.
- Prefer concrete suggestions ("add 5 lb to bench next session") over abstract advice ("focus on progressive overload").

## Be genuinely helpful

You are a seasoned pro and broadly knowledgeable — not just in your section's domain but across science, technology, history, philosophy, culture, finance, programming, cooking, language, travel, and the world at large. Help the user to the very best of your ability on whatever they ask.

If the question is in your section's domain (fitness, macros, health, etc.), use the user's actual logged data as the foundation. If the question is outside your section's logged data but still inside your area of expertise (general nutrition science, training theory, sleep research, productivity habits, etc.) — answer it directly from your own knowledge. Don't deflect to "I only have your data" when general advice is what's being asked for.

If the question is fully off-topic — a coding question while sitting in the fitness tab, a history question in macros — give the best answer you can anyway. You're a butler with a specialty, not a chatbot trapped in a single subject. Just don't fabricate data about the user.

When giving advice (training plans, nutrition strategy, sleep habits, how to debug something, how to phrase an email), be specific and decisive. Give the answer you'd actually give a friend who asked.

## Persona — English butler

Speak as a proper English butler. Address the user as "sir" occasionally — once per response is plenty, never tacked onto every sentence. Be measured, polite, and dry. Old-fashioned phrasing is welcome where it fits naturally ("Very good, sir", "Indeed", "If I may", "Most regrettable", "Quite so", "I'm afraid…") but don't overdo it or sound theatrical. Skip casual greetings ("hey", "what's up") and corporate-speak ("I'd be happy to help!", "feel free to ask"). Open with the substance, not pleasantries. Wry humor in the right moments is welcome — these butlers have seen things. The hard rules above still apply: butler tone doesn't excuse fluff, fabrication, or filler. Be the kind of butler who saves the user from themselves with a perfectly-timed observation, not the kind who recites their own duties.

---

`

function dateLine(): string {
  return `Current local time: ${new Date().toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

export async function buildCoachPrompt(key: CoachKey): Promise<string> {
  switch (key) {
    case 'home': return await buildHomePrompt()
    case 'fitness': return await buildFitnessPrompt()
    case 'macros': return await buildMacrosPrompt()
    case 'goals': return await buildGoalsPrompt()
    case 'health': return await buildHealthPrompt()
  }
}

/* -------------------- Home (everything) -------------------- */

async function buildHomePrompt(): Promise<string> {
  const today = startOfToday()
  const weekStart = startOfWeek()

  // Calendar — show next 7 days with IDs so Alfred can edit/delete by id.
  let calendarBlock = '## Calendar — next 7 days\n'
  try {
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 86_400_000)
    const events = await listEventsForRange(now, weekEnd)
    if (events.length === 0) {
      calendarBlock += '(no events in the next 7 days)\n'
    } else {
      for (const e of events) {
        const dateStr = e.start.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const time = e.allDay
          ? 'all day'
          : e.start.toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })
        calendarBlock += `- [${e.id}] ${dateStr} ${time}: ${e.title}${e.location ? ` @ ${e.location}` : ''}\n`
      }
    }
  } catch {
    calendarBlock += '(not signed in to Google)\n'
  }

  // Tasks this week
  const tasks = await db.tasks.where('createdAt').aboveOrEqual(weekStart).toArray()
  const incomplete = tasks.filter((t) => t.status !== 'completed')
  let tasksBlock = '## Tasks this week\n'
  if (incomplete.length === 0) {
    tasksBlock += '(none open)\n'
  } else {
    for (const t of incomplete) {
      tasksBlock += `- ${t.title}${t.description ? ` — ${t.description}` : ''}\n`
    }
  }

  // Habits — only active (not archived). Today's status is derived from
  // habit_entries rather than the old h.history array.
  const habits = (await db.habits.toArray()).filter((h) => !h.archivedAt)
  let habitsBlock = '## Habits today\n'
  if (habits.length === 0) {
    habitsBlock += '(none)\n'
  } else {
    for (const h of habits) {
      const entry = await db.habit_entries
        .where('[habitId+date]')
        .equals([h.id!, today])
        .first()
      const doneToday = entry ? entry.value >= (entry.target || 1) : false
      habitsBlock += `- ${h.name}: ${doneToday ? '✓ done today' : 'pending'} (streak ${h.streak}d)\n`
    }
  }

  // Daily metrics
  const waterLog = await db.health_logs
    .where('[date+type]')
    .equals([today, 'water'])
    .first()
  const sleepLog = await db.health_logs
    .where('[date+type]')
    .equals([today, 'sleep'])
    .first()
  const todayMeals = await db.meal_entries.where('date').equals(today).toArray()
  const todayMacros = sumMacros(todayMeals)
  const calorieGoal =
    (await getSetting<number>('goal_calories')) ?? MACRO_GOALS.calories.default

  const metricsBlock = `## Today's metrics
- Water: ${(waterLog?.value ?? 0).toFixed(2)} L
- Sleep last night: ${sleepLog?.value ?? '?'} h
- Calories: ${Math.round(todayMacros.calories)} / ${calorieGoal} (P${Math.round(todayMacros.protein)}g · C${Math.round(todayMacros.carbs)}g · F${Math.round(todayMacros.fat)}g)`

  // Recent workouts
  const allWorkouts = await db.workouts.orderBy('date').reverse().toArray()
  const completedWorkouts = allWorkouts.filter((w) => w.completedAt !== undefined)
  const recentWorkouts = completedWorkouts.slice(0, 3)
  let workoutsBlock = '## Recent workouts\n'
  if (recentWorkouts.length === 0) {
    workoutsBlock += '(none)\n'
  } else {
    for (const w of recentWorkouts) {
      const date = new Date(w.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
      workoutsBlock += `- ${date} ${w.name}: ${w.exercises.length} exercises, ${Math.round(totalVolume(w))} lb, ${totalReps(w)} reps\n`
    }
  }

  // Active goals
  const activeGoals = await db.goals.where('status').equals('active').toArray()
  let goalsBlock = '## Active goals\n'
  if (activeGoals.length === 0) {
    goalsBlock += '(none)\n'
  } else {
    for (const g of activeGoals) {
      const deadline = g.targetDate ? ` — ${formatDeadline(g.targetDate)}` : ''
      goalsBlock += `- [${TERM_LABELS[g.term]}] ${g.title}${deadline}\n`
    }
  }

  return `${BASE_PROMPT}Your name is Alfred. You are a pro life-management assistant that is very knowledgeable. Do NOT make up any info, no exceptions. Use only the data provided below. If asked who you are, say Alfred.

You see the user's full picture across calendar, tasks, habits, daily metrics, fitness, macros, and goals. Use this whole-life view to help with cross-cutting questions ("how's my week going?" / "should I do legs tomorrow given my sleep?").

## Tools you can use

You have tools to manage the user's Google Calendar (real events, synced with their actual Google Calendar):
- **create_event(title, start_iso, end_iso, all_day?, recurrence?, location?, description?)** — schedule something new.
- **update_event(event_id, …fields)** — change an existing event by ID. Event IDs are shown in [brackets] in the calendar block below.
- **delete_event(event_id)** — cancel an event. Only call when the user explicitly confirms.
- **list_events(start_date, end_date)** — look up events outside the visible 7-day window (dates in YYYY-MM-DD).

When the user asks to schedule, change, or delete events: confirm the title and times before calling tools. Don't make up details. After running a tool, briefly state what you did. NOTE: editing or deleting a recurring event modifies the whole series, not a single occurrence — warn the user if relevant.

${dateLine()}

${calendarBlock}
${tasksBlock}
${habitsBlock}
${metricsBlock}

${workoutsBlock}
${goalsBlock}`
}

/* -------------------- Fitness -------------------- */

async function buildFitnessPrompt(): Promise<string> {
  const allWorkouts = (await db.workouts.orderBy('date').reverse().toArray()).filter(
    (w): w is Workout & { completedAt: number } => w.completedAt !== undefined,
  )
  const recent = allWorkouts.slice(0, 10)

  let workoutsBlock = '## Last 10 workouts\n'
  if (recent.length === 0) {
    workoutsBlock += '(no workouts logged yet)\n'
  } else {
    for (const w of recent) {
      const date = new Date(w.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
      const dur = w.durationSec ? `, ${formatDuration(w.durationSec)}` : ''
      workoutsBlock += `### ${date} — ${w.name} (${Math.round(totalVolume(w))} lb, ${totalReps(w)} reps${dur})\n`
      for (const ex of w.exercises) {
        const completed = ex.sets.filter(isSetCompleted)
        if (completed.length === 0) continue
        const setsStr = completed
          .map((s) => `${s.reps}×${s.weight}${s.rpe ? ` @${s.rpe}` : ''}`)
          .join(', ')
        workoutsBlock += `- ${ex.exerciseName}: ${setsStr}\n`
      }
    }
  }

  // Top PRs across all logged exercises
  const exercises = await db.exercises.toArray()
  const prList: { name: string; reps: number; weight: number; e1rm: number }[] = []
  for (const ex of exercises) {
    if (ex.id === undefined || (ex.useCount ?? 0) === 0) continue
    const best = bestSetForExercise(allWorkouts, ex.id)
    if (best) {
      prList.push({
        name: ex.name,
        reps: best.reps,
        weight: best.weight,
        e1rm: best.e1rm,
      })
    }
  }
  prList.sort((a, b) => b.e1rm - a.e1rm)
  const topPRs = prList.slice(0, 8)

  let prsBlock = '## Top PRs (by estimated 1-rep max)\n'
  if (topPRs.length === 0) {
    prsBlock += '(none yet)\n'
  } else {
    for (const pr of topPRs) {
      prsBlock += `- ${pr.name}: ${pr.reps}×${Math.round(pr.weight)} lb (e1RM ${Math.round(pr.e1rm)})\n`
    }
  }

  // Volume trend (last 4 weeks)
  const today = startOfToday()
  const weekMs = 7 * 86_400_000
  const weeks: number[] = [0, 0, 0, 0]
  for (const w of allWorkouts) {
    const ageWeeks = Math.floor((today - w.date) / weekMs)
    if (ageWeeks >= 0 && ageWeeks < 4) {
      weeks[ageWeeks] += totalVolume(w)
    }
  }
  const trendBlock = `## Weekly volume (last 4 weeks)
- This week: ${Math.round(weeks[0]).toLocaleString()} lb
- 1 week ago: ${Math.round(weeks[1]).toLocaleString()} lb
- 2 weeks ago: ${Math.round(weeks[2]).toLocaleString()} lb
- 3 weeks ago: ${Math.round(weeks[3]).toLocaleString()} lb`

  return `${BASE_PROMPT}Your name is Jarvis. You are a pro strength and conditioning coach that is very knowledgeable. Do NOT make up any info, no exceptions. Use only the data provided below. If asked who you are, say Jarvis.

The user logs their workouts (sets, reps, weights, RPE) and wants concrete feedback. Suggest specific weight increments, set/rep changes, exercise additions or substitutions tied to what's actually in their log.

## Tools you can use

You have tools to TAKE ACTIONS on the user's workout. Use them when the user is clearly logging or planning, not when they're just asking questions.
- **start_workout(name?)** — start a new active workout (only one allowed at a time).
- **add_exercise_to_workout(exercise_name)** — adds an exercise from the user's library to the active workout. The exercise must exist in their library; if not, tell them to add it manually via the Fitness tab.
- **log_set(exercise_name, weight, reps, rpe?)** — log a completed set. Use ONLY weight/reps/rpe the user explicitly stated. Do NOT estimate or fill in missing values.
- **finish_workout()** — complete the active workout. Only call this when the user explicitly says they're done.

When the user says "make me a push workout", call start_workout then a series of add_exercise_to_workout calls using exercises from their library that fit. When they say "8 at 135 on bench", call log_set. After running tools, briefly state what you did (one line per action).

If the user asks about nutrition, sleep, goals, or anything else outside fitness — point them to the appropriate tab; you don't have that data here.

${dateLine()}

${workoutsBlock}
${prsBlock}
${trendBlock}`
}

/* -------------------- Macros -------------------- */

async function buildMacrosPrompt(): Promise<string> {
  const today = startOfToday()
  const todayMeals = await db.meal_entries.where('date').equals(today).toArray()
  const todayMacros = sumMacros(todayMeals)

  // Goals
  const goals = {
    calories:
      (await getSetting<number>(MACRO_GOALS.calories.settingKey)) ??
      MACRO_GOALS.calories.default,
    protein:
      (await getSetting<number>(MACRO_GOALS.protein.settingKey)) ??
      MACRO_GOALS.protein.default,
    carbs:
      (await getSetting<number>(MACRO_GOALS.carbs.settingKey)) ??
      MACRO_GOALS.carbs.default,
    fat:
      (await getSetting<number>(MACRO_GOALS.fat.settingKey)) ??
      MACRO_GOALS.fat.default,
  }

  let mealsBlock = "## Today's meals\n"
  if (todayMeals.length === 0) {
    mealsBlock += '(nothing logged today)\n'
  } else {
    for (const meal of MEAL_ORDER) {
      const items = todayMeals.filter((e) => e.type === meal)
      if (items.length === 0) continue
      mealsBlock += `**${MEAL_LABELS[meal]}**\n`
      for (const e of items) {
        const servings = e.servings === 1 ? '' : ` ×${e.servings}`
        mealsBlock += `- ${e.foodName}${servings}: ${Math.round(e.macros.calories)} kcal · P${Math.round(e.macros.protein)} C${Math.round(e.macros.carbs)} F${Math.round(e.macros.fat)}\n`
      }
    }
  }

  const totalsBlock = `## Today vs goals
- Calories: ${Math.round(todayMacros.calories)} / ${goals.calories} (${Math.round(goals.calories - todayMacros.calories)} remaining)
- Protein: ${Math.round(todayMacros.protein)} / ${goals.protein}g (${Math.round(goals.protein - todayMacros.protein)} remaining)
- Carbs: ${Math.round(todayMacros.carbs)} / ${goals.carbs}g (${Math.round(goals.carbs - todayMacros.carbs)} remaining)
- Fat: ${Math.round(todayMacros.fat)} / ${goals.fat}g (${Math.round(goals.fat - todayMacros.fat)} remaining)`

  // 7-day average
  const weekAgo = today - 6 * 86_400_000
  const weekMeals = await db.meal_entries
    .where('date')
    .between(weekAgo, today, true, true)
    .toArray()
  const dayBuckets = new Map<number, typeof weekMeals>()
  for (const m of weekMeals) {
    const arr = dayBuckets.get(m.date) ?? []
    arr.push(m)
    dayBuckets.set(m.date, arr)
  }
  const dailyTotals = Array.from(dayBuckets.values()).map(sumMacros)
  const days = dailyTotals.length || 1
  const avg = {
    calories: dailyTotals.reduce((s, t) => s + t.calories, 0) / days,
    protein: dailyTotals.reduce((s, t) => s + t.protein, 0) / days,
    carbs: dailyTotals.reduce((s, t) => s + t.carbs, 0) / days,
    fat: dailyTotals.reduce((s, t) => s + t.fat, 0) / days,
  }

  const weeklyBlock = `## Last 7 days average (${dailyTotals.length} days logged)
- ${Math.round(avg.calories)} kcal/day · P${Math.round(avg.protein)}g · C${Math.round(avg.carbs)}g · F${Math.round(avg.fat)}g`

  // Top foods
  const topFoods = await db.foods.orderBy('useCount').reverse().limit(10).toArray()
  let foodsBlock = '## Food library — top 10 by usage\n'
  if (topFoods.length === 0) {
    foodsBlock += '(empty — user hasn\'t added any foods yet)\n'
  } else {
    for (const f of topFoods) {
      foodsBlock += `- ${f.name} (${f.servingSize}): ${Math.round(f.macros.calories)} kcal · P${Math.round(f.macros.protein)} C${Math.round(f.macros.carbs)} F${Math.round(f.macros.fat)}\n`
    }
  }

  return `${BASE_PROMPT}Your name is Sebastian. You are a pro nutrition coach that is very knowledgeable. Do NOT make up any info, no exceptions. Use only the data provided below. If asked who you are, say Sebastian.

The user logs their meals and wants practical guidance for hitting their macro targets. When suggesting meals or portions, reference foods from their library — those are things they actually eat and have macros saved for.

## Tools you can use

You have tools to LOG FOODS to the user's day. Use them when the user is clearly logging what they ate.
- **log_food_from_library(meal, food_name, servings)** — log a food that's already in their library (case-insensitive name match). Macros come from the library, not from you.
- **log_new_food(meal, name, serving_size, servings, calories, protein_g, carbs_g, fat_g)** — log a food NOT in their library AND save it. ONLY use this when the user has explicitly told you the macros. Estimating macros from general knowledge is FORBIDDEN — that's "making up data".

When the user says "I had X for breakfast":
1. Check if X is in their library (top foods are listed below).
2. If yes, call log_food_from_library.
3. If no, ASK them for the macros first ("What are the macros per serving of [X]?"). Once they tell you, call log_new_food.
4. NEVER call log_new_food with macros you guessed.

After running tools, briefly summarize what you logged and the user's remaining macros for the day.

If the user asks about workouts, goals, or anything outside nutrition — point them to the appropriate tab; you don't have that data here.

${dateLine()}

${mealsBlock}
${totalsBlock}

${weeklyBlock}

${foodsBlock}`
}

/* -------------------- Goals -------------------- */

async function buildGoalsPrompt(): Promise<string> {
  const allGoals = await db.goals.orderBy('createdAt').reverse().toArray()
  const active = allGoals.filter((g) => g.status === 'active')
  const completed = allGoals.filter((g) => g.status === 'completed')

  // Pre-load journal entries for all active goals
  const allJournal = await db.goal_journal.toArray()
  const journalByGoal = new Map<number, typeof allJournal>()
  for (const e of allJournal) {
    const arr = journalByGoal.get(e.goalId) ?? []
    arr.push(e)
    journalByGoal.set(e.goalId, arr)
  }

  let activeBlock = '## Active goals\n'
  if (active.length === 0) {
    activeBlock += '(none)\n'
  } else {
    for (const g of active) {
      const deadline = g.targetDate
        ? formatDeadline(g.targetDate)
        : 'no deadline'
      activeBlock += `### [${TERM_LABELS[g.term]}] ${g.title}\n`
      if (g.description) activeBlock += `${g.description}\n`
      activeBlock += `Deadline: ${deadline}\n`

      const journal = (journalByGoal.get(g.id!) ?? []).sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      if (journal.length > 0) {
        activeBlock += 'Recent journal entries:\n'
        for (const e of journal.slice(0, 5)) {
          const date = new Date(e.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          activeBlock += `  - ${date}: ${e.text}\n`
        }
      } else {
        activeBlock += '(no journal entries yet)\n'
      }
      activeBlock += '\n'
    }
  }

  let completedBlock = '## Recently completed goals\n'
  const recentDone = completed.slice(0, 5)
  if (recentDone.length === 0) {
    completedBlock += '(none)\n'
  } else {
    for (const g of recentDone) {
      const dateStr = g.completedAt
        ? new Date(g.completedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        : ''
      completedBlock += `- ${g.title}${dateStr ? ` (done ${dateStr})` : ''}\n`
    }
  }

  return `${BASE_PROMPT}Your name is Benson. You are a pro goals & accountability coach that is very knowledgeable. Do NOT make up any info, no exceptions. Use only the data provided below. If asked who you are, say Benson.

You see all the user's active goals, descriptions, deadlines, and progress journal entries. Help them reflect, plan next steps, and stay accountable. Reference specific goals by name when giving advice. If they ask about workouts, macros, or daily habits — point them to the appropriate tab; you don't have that data here.

${dateLine()}

${activeBlock}
${completedBlock}`
}

/* -------------------- Health -------------------- */

async function buildHealthPrompt(): Promise<string> {
  const today = startOfToday()
  const fourteenDaysAgo = today - 13 * 86_400_000
  const thirtyDaysAgo = today - 29 * 86_400_000

  const recentLogs = await db.health_logs
    .where('date')
    .between(thirtyDaysAgo, today, true, true)
    .toArray()

  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })

  const byType = (t: string) =>
    recentLogs
      .filter((l) => l.type === t)
      .sort((a, b) => b.date - a.date)

  const weightLogs = byType('weight')
  const moodLogs = byType('mood').filter((l) => l.date >= fourteenDaysAgo)
  const energyLogs = byType('energy').filter((l) => l.date >= fourteenDaysAgo)
  const sleepLogs = byType('sleep').filter((l) => l.date >= fourteenDaysAgo)
  const waterLogs = byType('water').filter((l) => l.date >= fourteenDaysAgo)

  const formatList = (
    label: string,
    logs: typeof recentLogs,
    unit: string,
  ): string => {
    if (logs.length === 0) return `## ${label}\n(no entries)\n`
    let out = `## ${label}\n`
    for (const l of logs.slice(0, 14)) {
      out += `- ${fmt(l.date)}: ${l.value}${unit}${l.notes ? ` — ${l.notes}` : ''}\n`
    }
    return out
  }

  const weightBlock = formatList('Weight (last 30 days)', weightLogs, ' lb')
  const moodBlock = formatList('Mood — 1-10 (last 14 days)', moodLogs, '/10')
  const energyBlock = formatList('Energy — 1-10 (last 14 days)', energyLogs, '/10')
  const sleepBlock = formatList('Sleep (last 14 days)', sleepLogs, ' h')
  const waterBlock = formatList('Water (last 14 days)', waterLogs, ' L')

  // Trends — simple 7-day vs prior 7-day comparison for weight
  let trendBlock = ''
  if (weightLogs.length >= 4) {
    const last7 = weightLogs.filter((l) => l.date >= today - 6 * 86_400_000)
    const prev7 = weightLogs.filter(
      (l) => l.date >= today - 13 * 86_400_000 && l.date < today - 6 * 86_400_000,
    )
    if (last7.length > 0 && prev7.length > 0) {
      const avg = (xs: typeof recentLogs) =>
        xs.reduce((s, l) => s + l.value, 0) / xs.length
      const diff = avg(last7) - avg(prev7)
      const sign = diff >= 0 ? '+' : ''
      trendBlock = `## Weight trend\n- Last 7 days avg: ${avg(last7).toFixed(1)} lb\n- Prior 7 days avg: ${avg(prev7).toFixed(1)} lb\n- Change: ${sign}${diff.toFixed(1)} lb\n`
    }
  }

  return `${BASE_PROMPT}Your name is Cornelius. You are a pro health coach with deep expertise in sleep, recovery, hydration, weight management, and the relationship between mood, energy, and physical health. Do NOT make up any info, no exceptions. Use only the data provided below. If asked who you are, say Cornelius.

The user logs daily metrics — weight, mood, energy, sleep, water — and wants concrete, grounded feedback. Look for patterns across metrics ("your energy dips on days you sleep under 6 hours", "weight drift correlates with low water weeks"). Quote specific dates and numbers from the logs.

If the user asks about workouts, macros, calendar, tasks, or goals — point them to the appropriate tab; you don't have that data here.

${dateLine()}

${weightBlock}
${trendBlock}
${moodBlock}
${energyBlock}
${sleepBlock}
${waterBlock}`
}
