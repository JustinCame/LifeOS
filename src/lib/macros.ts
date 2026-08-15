import { db, getSetting, setSetting } from '../db'
import type {
  Food,
  Macros,
  MealEntry,
  Recipe,
  RecipeIngredient,
} from '../db/types'
import { startOfToday } from './health'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
}

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

interface MacroGoalConfig {
  settingKey: string
  default: number
  unit: string
  label: string
}

export const MACRO_GOALS: Record<MacroKey, MacroGoalConfig> = {
  calories: { settingKey: 'goal_calories', default: 2200, unit: '', label: 'Calories' },
  protein: { settingKey: 'goal_protein_g', default: 150, unit: 'g', label: 'Protein' },
  carbs: { settingKey: 'goal_carbs_g', default: 250, unit: 'g', label: 'Carbs' },
  fat: { settingKey: 'goal_fat_g', default: 70, unit: 'g', label: 'Fat' },
}

export async function getMacroGoal(key: MacroKey): Promise<number> {
  const stored = await getSetting<number>(MACRO_GOALS[key].settingKey)
  return stored ?? MACRO_GOALS[key].default
}

export async function setMacroGoal(key: MacroKey, value: number): Promise<void> {
  await setSetting(MACRO_GOALS[key].settingKey, value)
}

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

export function sumMacros(entries: MealEntry[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => ({
      calories: acc.calories + e.macros.calories,
      protein: acc.protein + e.macros.protein,
      carbs: acc.carbs + e.macros.carbs,
      fat: acc.fat + e.macros.fat,
    }),
    { ...ZERO_MACROS },
  )
}

export function scaleMacros(macros: Macros, servings: number): Macros {
  return {
    calories: macros.calories * servings,
    protein: macros.protein * servings,
    carbs: macros.carbs * servings,
    fat: macros.fat * servings,
  }
}

export async function addMealEntry(
  type: MealType,
  food: Food,
  servings: number,
  date: number = startOfToday(),
): Promise<void> {
  const macros = scaleMacros(food.macros, servings)
  await db.meal_entries.add({
    date,
    type,
    foodId: food.id!,
    foodName: food.name,
    servings,
    macros,
    createdAt: Date.now(),
  })
  await db.foods.update(food.id!, {
    lastUsedAt: Date.now(),
    useCount: (food.useCount ?? 0) + 1,
  })
}

export async function deleteMealEntry(id: number): Promise<void> {
  await db.meal_entries.delete(id)
}

// One-off "quick add" entry — for random items the user doesn't want to save
// to the library (a cookie from a coffee shop, a bite of a friend's dessert).
// No foodId, no recipeId; label defaults to "Quick add" when blank.
export async function addQuickMealEntry(
  type: MealType,
  macros: Macros,
  label: string | undefined,
  date: number = startOfToday(),
): Promise<void> {
  await db.meal_entries.add({
    date,
    type,
    foodName: label?.trim() || 'Quick add',
    servings: 1,
    macros,
    createdAt: Date.now(),
  })
}

// Change the servings on a logged meal entry. Macros are rescaled from the
// entry's *original* per-serving snapshot so past entries stay predictable —
// editing the source food later doesn't retroactively alter logged macros.
export async function updateMealEntryServings(
  id: number,
  newServings: number,
): Promise<void> {
  if (newServings <= 0) throw new Error('servings must be > 0')
  const entry = await db.meal_entries.get(id)
  if (!entry) throw new Error('meal entry not found')
  const perServing: Macros =
    entry.servings > 0
      ? scaleMacros(entry.macros, 1 / entry.servings)
      : entry.macros
  await db.meal_entries.update(id, {
    servings: newServings,
    macros: scaleMacros(perServing, newServings),
  })
}

export type NewFood = Omit<Food, 'id' | 'createdAt' | 'useCount' | 'lastUsedAt'>

export async function addFood(food: NewFood): Promise<Food> {
  const createdAt = Date.now()
  const id = await db.foods.add({ ...food, createdAt, useCount: 0 })
  return { ...food, id: id as number, createdAt, useCount: 0 }
}

export async function deleteFood(id: number): Promise<void> {
  await db.foods.delete(id)
}

// Edit an existing food in the library. Per-serving macros, name, brand,
// serving size, and barcode can all change; useCount / lastUsedAt / createdAt
// are preserved so history isn't disturbed.
export async function updateFood(id: number, updates: NewFood): Promise<void> {
  await db.foods.update(id, updates)
}

// Look up a food in the library by barcode (UPC / EAN). Used when scanning:
// if the user has already saved this product, skip the OFF API + new-food
// form and go straight to picking servings.
export async function findFoodByBarcode(
  barcode: string,
): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first()
}

/* -------------------- Recipes -------------------- */

export type NewRecipe = Omit<
  Recipe,
  'id' | 'createdAt' | 'useCount' | 'lastUsedAt'
>

// Total macros for the whole recipe (before dividing by yields). Uses each
// ingredient's snapshotted per-serving macros so edits to the source food
// after the ingredient was added don't retroactively shift the total.
export function totalRecipeMacros(recipe: Recipe | NewRecipe): Macros {
  const t = { ...ZERO_MACROS }
  for (const ing of recipe.ingredients) {
    t.calories += ing.macrosPerServing.calories * ing.servings
    t.protein += ing.macrosPerServing.protein * ing.servings
    t.carbs += ing.macrosPerServing.carbs * ing.servings
    t.fat += ing.macrosPerServing.fat * ing.servings
  }
  return t
}

// Macros for ONE serving of the recipe — the unit shown at log time.
export function perServingRecipeMacros(recipe: Recipe | NewRecipe): Macros {
  const yields = recipe.yields > 0 ? recipe.yields : 1
  return scaleMacros(totalRecipeMacros(recipe), 1 / yields)
}

// Build a fresh ingredient from a food. Snapshots foodName + per-serving
// macros so later edits to the food don't change what the recipe totals.
export function ingredientFromFood(
  food: Food,
  servings: number,
): RecipeIngredient {
  return {
    foodId: food.id!,
    foodName: food.name,
    servings,
    macrosPerServing: { ...food.macros },
  }
}

export async function addRecipe(recipe: NewRecipe): Promise<Recipe> {
  const createdAt = Date.now()
  const id = await db.recipes.add({ ...recipe, createdAt, useCount: 0 })
  return { ...recipe, id: id as number, createdAt, useCount: 0 }
}

export async function updateRecipe(
  id: number,
  updates: NewRecipe,
): Promise<void> {
  await db.recipes.update(id, updates)
}

export async function deleteRecipe(id: number): Promise<void> {
  await db.recipes.delete(id)
}

// Log a recipe as a single meal entry. `servings` is how many servings of the
// recipe (not the whole thing) the user is eating — so half of a 4-serving
// pot is `servings: 1`, i.e. 1/4 of the totalRecipeMacros.
export async function logRecipeToMeal(
  recipe: Recipe,
  type: MealType,
  servings: number,
  date: number = startOfToday(),
): Promise<void> {
  if (servings <= 0) throw new Error('servings must be > 0')
  const perServing = perServingRecipeMacros(recipe)
  await db.meal_entries.add({
    date,
    type,
    recipeId: recipe.id!,
    foodName: recipe.name,
    servings,
    macros: scaleMacros(perServing, servings),
    createdAt: Date.now(),
  })
  await db.recipes.update(recipe.id!, {
    lastUsedAt: Date.now(),
    useCount: (recipe.useCount ?? 0) + 1,
  })
}
