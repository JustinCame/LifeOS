import { db } from '../db'
import type { Food, HealthLog, Workout } from '../db/types'
import { perServingRecipeMacros, totalRecipeMacros } from './macros'

// Human-readable text exports for sharing with a coach. Each function returns
// a plain string the user can copy/paste — no JSON, no markdown table syntax.

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function trimNum(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/* -------------------- Fitness -------------------- */

// Lists every completed workout with each exercise's sets in
// "reps × weight @ RPE" form. Sets that were logged but never marked complete
// are skipped so the coach only sees what actually happened.
export async function exportFitnessText(): Promise<string> {
  const workouts = await db.workouts.orderBy('date').toArray()
  const completed = workouts.filter((w): w is Workout => w.completedAt !== undefined)

  if (completed.length === 0) return 'No completed workouts yet.\n'

  const lines: string[] = []
  lines.push(`Workout log — ${completed.length} ${completed.length === 1 ? 'workout' : 'workouts'}`)
  lines.push('Format: reps × weight lb @ RPE (RPE omitted if not logged)')
  lines.push('')

  for (const w of completed) {
    lines.push(`${formatDate(w.date)} — ${w.name}`)
    for (const ex of w.exercises) {
      const performed = ex.sets.filter((s) => s.completedAt !== undefined)
      if (performed.length === 0) continue
      lines.push(`  ${ex.exerciseName}`)
      for (const s of performed) {
        const rpe = s.rpe !== undefined ? ` @ RPE ${trimNum(s.rpe)}` : ''
        lines.push(`    ${s.reps} × ${trimNum(s.weight)} lb${rpe}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

/* -------------------- Health (weight only) -------------------- */

// Every weight entry since tracking started, oldest → newest, one per line.
export async function exportHealthText(): Promise<string> {
  const all = await db.health_logs.toArray()
  const weights = all
    .filter((l): l is HealthLog => l.type === 'weight')
    .sort((a, b) => a.date - b.date)

  if (weights.length === 0) return 'No weight entries logged yet.\n'

  const unit = weights[0].unit ?? 'lb'
  const lines: string[] = []
  lines.push(`Weight log — ${weights.length} ${weights.length === 1 ? 'entry' : 'entries'}`)
  lines.push('')
  for (const l of weights) {
    lines.push(`${formatDate(l.date)}  ${l.value.toFixed(1)} ${l.unit ?? unit}`)
  }

  return lines.join('\n')
}

/* -------------------- Macros (food library) -------------------- */

// The user's saved food library — per-serving macros for every food they've
// logged, plus their recipes (with ingredients + totals). Sorted by most-used
// so the coach sees staples first.
export async function exportMacrosText(): Promise<string> {
  const [foods, recipes] = await Promise.all([
    db.foods.toArray(),
    db.recipes.toArray(),
  ])

  if (foods.length === 0 && recipes.length === 0) {
    return 'No foods or recipes saved yet.\n'
  }

  const lines: string[] = []

  if (foods.length > 0) {
    const sortedFoods = [...foods].sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount
      return a.name.localeCompare(b.name)
    })

    lines.push(
      `Food library — ${sortedFoods.length} ${sortedFoods.length === 1 ? 'food' : 'foods'}`,
    )
    lines.push('Macros are per serving (calories · C carbs · P protein · F fat)')
    lines.push('')

    for (const f of sortedFoods as Food[]) {
      const brand = f.brand ? ` (${f.brand})` : ''
      lines.push(`${f.name}${brand}`)
      lines.push(
        `  serving: ${f.servingSize}${f.servingGrams ? ` (${f.servingGrams} g)` : ''}`,
      )
      lines.push(
        `  ${Math.round(f.macros.calories)} kcal · C${Math.round(f.macros.carbs)} · P${Math.round(f.macros.protein)} · F${Math.round(f.macros.fat)}`,
      )
      if (f.useCount > 0) {
        lines.push(`  logged ${f.useCount}×`)
      }
      lines.push('')
    }
  }

  if (recipes.length > 0) {
    const sortedRecipes = [...recipes].sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount
      return a.name.localeCompare(b.name)
    })

    lines.push(
      `Recipes — ${sortedRecipes.length} ${sortedRecipes.length === 1 ? 'recipe' : 'recipes'}`,
    )
    lines.push('')

    for (const r of sortedRecipes) {
      const total = totalRecipeMacros(r)
      const per = perServingRecipeMacros(r)
      lines.push(`${r.name} — makes ${r.yields} ${r.yields === 1 ? 'serving' : 'servings'}`)
      if (r.notes) lines.push(`  notes: ${r.notes}`)
      for (const ing of r.ingredients) {
        const ingMacros = {
          calories: ing.macrosPerServing.calories * ing.servings,
          carbs: ing.macrosPerServing.carbs * ing.servings,
          protein: ing.macrosPerServing.protein * ing.servings,
          fat: ing.macrosPerServing.fat * ing.servings,
        }
        lines.push(
          `  · ${trimNum(ing.servings)}× ${ing.foodName} — ${Math.round(ingMacros.calories)} kcal · C${Math.round(ingMacros.carbs)} P${Math.round(ingMacros.protein)} F${Math.round(ingMacros.fat)}`,
        )
      }
      lines.push(
        `  total: ${Math.round(total.calories)} kcal · C${Math.round(total.carbs)} P${Math.round(total.protein)} F${Math.round(total.fat)}`,
      )
      lines.push(
        `  per serving: ${Math.round(per.calories)} kcal · C${Math.round(per.carbs)} P${Math.round(per.protein)} F${Math.round(per.fat)}`,
      )
      if (r.useCount > 0) {
        lines.push(`  logged ${r.useCount}×`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
