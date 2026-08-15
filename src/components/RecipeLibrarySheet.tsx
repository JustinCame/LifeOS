import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Food, Recipe, RecipeIngredient } from "../db/types";
import {
  MEAL_LABELS,
  MEAL_ORDER,
  addFood,
  addRecipe,
  deleteRecipe,
  ingredientFromFood,
  logRecipeToMeal,
  perServingRecipeMacros,
  totalRecipeMacros,
  updateRecipe,
  type MealType,
  type NewFood,
  type NewRecipe,
} from "../lib/macros";

interface Props {
  // The day new "log to meal" entries land on. Passed from Macros.tsx so the
  // sheet respects whichever day the user was browsing.
  logDate: number;
  onClose: () => void;
}

const TRANSITION_MS = 280;

// A working copy of a recipe used inside the edit view. `id` is set for
// existing recipes and undefined for the "new" flow, which is how we branch
// between updateRecipe / addRecipe on save.
interface Draft {
  id?: number;
  name: string;
  notes: string;
  yields: string;
  ingredients: RecipeIngredient[];
  createdAt?: number;
  useCount?: number;
  lastUsedAt?: number;
}

function draftFromRecipe(r: Recipe): Draft {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? "",
    yields: r.yields.toString(),
    ingredients: [...r.ingredients],
    createdAt: r.createdAt,
    useCount: r.useCount,
    lastUsedAt: r.lastUsedAt,
  };
}

function emptyDraft(): Draft {
  return { name: "", notes: "", yields: "1", ingredients: [] };
}

export default function RecipeLibrarySheet({ logDate, onClose }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [pickingIngredient, setPickingIngredient] = useState(false);
  const [loggingRecipe, setLoggingRecipe] = useState<Recipe | null>(null);

  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recipes = useLiveQuery(() =>
    db.recipes.orderBy("name").toArray(),
  ) ?? [];

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  // What's currently in the top slot of the sheet — drives header label +
  // back button behavior.
  let view: "list" | "edit" | "pickIngredient" | "log";
  if (loggingRecipe) view = "log";
  else if (pickingIngredient) view = "pickIngredient";
  else if (draft) view = "edit";
  else view = "list";

  const headerLabel =
    view === "list"
      ? "Recipes"
      : view === "edit"
        ? draft?.id
          ? "Edit recipe"
          : "New recipe"
        : view === "pickIngredient"
          ? "Add ingredient"
          : "Log to meal";

  const goBack = () => {
    if (view === "log") setLoggingRecipe(null);
    else if (view === "pickIngredient") setPickingIngredient(false);
    else if (view === "edit") setDraft(null);
  };

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          {view === "list" ? (
            <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
              {headerLabel}
            </span>
          ) : (
            <button
              onClick={goBack}
              className="text-base text-accent-fg"
            >
              ← Back
            </button>
          )}
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>
        {view !== "list" && (
          <div className="px-[18px] pb-1 text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {headerLabel}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {view === "list" && (
            <ListView
              query={query}
              setQuery={setQuery}
              recipes={filteredRecipes}
              onOpen={(r) => setDraft(draftFromRecipe(r))}
              onNew={() => setDraft(emptyDraft())}
            />
          )}

          {view === "edit" && draft && (
            <EditView
              draft={draft}
              setDraft={setDraft}
              onSave={async () => {
                const yields = parseFloat(draft.yields);
                if (Number.isNaN(yields) || yields <= 0) {
                  alert("Yields must be a positive number.");
                  return;
                }
                const payload: NewRecipe = {
                  name: draft.name.trim(),
                  yields,
                  ingredients: draft.ingredients,
                  ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
                };
                if (draft.id) {
                  await updateRecipe(draft.id, payload);
                } else {
                  await addRecipe(payload);
                }
                setDraft(null);
              }}
              onDelete={async () => {
                if (!draft.id) return;
                if (confirm(`Delete recipe "${draft.name}"?`)) {
                  await deleteRecipe(draft.id);
                  setDraft(null);
                }
              }}
              onAddIngredient={() => setPickingIngredient(true)}
              onLogToMeal={() => {
                if (!draft.id) {
                  alert("Save the recipe first, then log it.");
                  return;
                }
                // Refresh from Dexie so useCount / lastUsedAt stay accurate.
                db.recipes.get(draft.id).then((r) => {
                  if (r) setLoggingRecipe(r);
                });
              }}
            />
          )}

          {view === "pickIngredient" && draft && (
            <PickIngredientView
              onPick={(ing) => {
                setDraft({
                  ...draft,
                  ingredients: [...draft.ingredients, ing],
                });
                setPickingIngredient(false);
              }}
            />
          )}

          {view === "log" && loggingRecipe && (
            <LogToMealView
              recipe={loggingRecipe}
              onConfirm={async (meal, servings) => {
                await logRecipeToMeal(loggingRecipe, meal, servings, logDate);
                close();
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------- List view -------------------- */

function ListView({
  query,
  setQuery,
  recipes,
  onOpen,
  onNew,
}: {
  query: string;
  setQuery: (s: string) => void;
  recipes: Recipe[];
  onOpen: (r: Recipe) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full bg-transparent outline-none placeholder:text-subtle"
          />
        </div>
        <button
          onClick={onNew}
          className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent text-[#0a160d]"
          aria-label="New recipe"
        >
          <PlusIcon />
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
          {query.trim() ? `No matches for "${query}".` : "No recipes yet. Tap + to build one."}
        </div>
      ) : (
        <div className="space-y-1">
          {recipes.map((r) => {
            const per = perServingRecipeMacros(r);
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r)}
                className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left hover:border-border-strong active:scale-[0.995]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-tight text-fg">{r.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {r.ingredients.length}{" "}
                    {r.ingredients.length === 1 ? "ingredient" : "ingredients"} ·{" "}
                    {r.yields} {r.yields === 1 ? "serving" : "servings"} ·{" "}
                    {Math.round(per.calories)} kcal/serving
                  </div>
                </div>
                <span className="text-subtle">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------- Edit view -------------------- */

function EditView({
  draft,
  setDraft,
  onSave,
  onDelete,
  onAddIngredient,
  onLogToMeal,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
  onAddIngredient: () => void;
  onLogToMeal: () => void;
}) {
  const totals = totalRecipeMacros({
    ingredients: draft.ingredients,
    yields: parseFloat(draft.yields) || 1,
    name: draft.name,
  } as NewRecipe);
  const perServing = {
    calories: totals.calories / (parseFloat(draft.yields) || 1),
    carbs: totals.carbs / (parseFloat(draft.yields) || 1),
    protein: totals.protein / (parseFloat(draft.yields) || 1),
    fat: totals.fat / (parseFloat(draft.yields) || 1),
  };
  const nameValid = draft.name.trim().length > 0;

  return (
    <div className="space-y-3 pt-2">
      <Field
        label="Name"
        value={draft.name}
        onChange={(v) => setDraft({ ...draft, name: v })}
        placeholder="Peanut butter smoothie"
      />

      <Field
        label="Yields (servings)"
        value={draft.yields}
        onChange={(v) => setDraft({ ...draft, yields: v })}
        numeric
      />

      <Field
        label="Notes (optional)"
        value={draft.notes}
        onChange={(v) => setDraft({ ...draft, notes: v })}
        placeholder="Prep time, method, source…"
      />

      <div className="rounded-[16px] border border-border bg-surface">
        <div className="flex items-baseline justify-between px-3.5 py-2.5">
          <span className="text-xs uppercase tracking-[0.06em] text-muted">
            Ingredients
          </span>
          <span className="font-mono text-[11px] text-subtle">
            {draft.ingredients.length}
          </span>
        </div>
        {draft.ingredients.length === 0 && (
          <div className="border-t border-border px-3.5 py-3 text-sm text-muted">
            No ingredients yet.
          </div>
        )}
        {draft.ingredients.map((ing, i) => {
          const total = {
            calories: ing.macrosPerServing.calories * ing.servings,
            carbs: ing.macrosPerServing.carbs * ing.servings,
            protein: ing.macrosPerServing.protein * ing.servings,
            fat: ing.macrosPerServing.fat * ing.servings,
          };
          return (
            <div
              key={i}
              className="flex items-start gap-2 border-t border-border px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight text-fg">
                  {formatServings(ing.servings)}× {ing.foodName}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {Math.round(total.calories)} kcal · C
                  {Math.round(total.carbs)} P{Math.round(total.protein)} F
                  {Math.round(total.fat)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={ing.servings}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    const next = [...draft.ingredients];
                    next[i] = {
                      ...ing,
                      servings: Number.isNaN(v) ? 0 : v,
                    };
                    setDraft({ ...draft, ingredients: next });
                  }}
                  className="w-14 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-xs outline-none"
                  aria-label={`${ing.foodName} servings`}
                />
                <button
                  onClick={() => {
                    const next = draft.ingredients.filter((_, idx) => idx !== i);
                    setDraft({ ...draft, ingredients: next });
                  }}
                  aria-label="Remove ingredient"
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
                >
                  <XIcon />
                </button>
              </div>
            </div>
          );
        })}
        <button
          onClick={onAddIngredient}
          className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"
        >
          + Add ingredient from library
        </button>
      </div>

      <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Totals
        </div>
        <div className="mt-1 font-mono text-sm text-fg">
          Whole recipe: {Math.round(totals.calories)} kcal · C
          {Math.round(totals.carbs)} P{Math.round(totals.protein)} F
          {Math.round(totals.fat)}
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted">
          Per serving: {Math.round(perServing.calories)} kcal · C
          {Math.round(perServing.carbs)} P{Math.round(perServing.protein)} F
          {Math.round(perServing.fat)}
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={!nameValid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          nameValid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Save recipe
      </button>
      {draft.id && (
        <button
          onClick={onLogToMeal}
          className="w-full rounded-[10px] border border-border bg-surface py-2.5 text-sm font-medium text-fg hover:border-border-strong"
        >
          Log to meal
        </button>
      )}
      {draft.id && (
        <button
          onClick={onDelete}
          className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
        >
          Delete recipe
        </button>
      )}
    </div>
  );
}

/* -------------------- Ingredient picker -------------------- */

function PickIngredientView({
  onPick,
}: {
  onPick: (ing: RecipeIngredient) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [servings, setServings] = useState("1");
  // "creating" toggles the inline new-food form so users don't have to leave
  // the recipe flow to add a one-off ingredient (garlic, herbs, etc.).
  const [creating, setCreating] = useState(false);

  const foods = useLiveQuery(() => db.foods.orderBy("name").toArray()) ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand?.toLowerCase().includes(q) ?? false),
    );
  }, [foods, query]);

  if (creating) {
    return (
      <NewFoodInlineForm
        initialName={query}
        onSave={async (payload) => {
          const created = await addFood(payload);
          setCreating(false);
          // Slide straight into the servings step for the just-created food.
          setSelected(created);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (selected) {
    const n = parseFloat(servings);
    const valid = !Number.isNaN(n) && n > 0;
    const preview = valid
      ? {
          calories: selected.macros.calories * n,
          carbs: selected.macros.carbs * n,
          protein: selected.macros.protein * n,
          fat: selected.macros.fat * n,
        }
      : selected.macros;
    return (
      <div className="space-y-4 pt-2">
        <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
          <div className="text-base font-medium leading-tight text-fg">
            {selected.name}
            {selected.brand && (
              <span className="text-muted"> · {selected.brand}</span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted">
            per {selected.servingSize}: {Math.round(selected.macros.calories)} kcal · C
            {Math.round(selected.macros.carbs)} P{Math.round(selected.macros.protein)} F
            {Math.round(selected.macros.fat)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Servings</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={servings}
            autoFocus
            onChange={(e) => setServings(e.target.value)}
            className="w-24 rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-sm outline-none"
          />
          <div className="ml-auto flex gap-1">
            {[0.5, 1, 2].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setServings(String(q))}
                className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-border-strong"
              >
                {q}×
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
          <div className="text-xs uppercase tracking-[0.06em] text-muted">
            Ingredient contributes
          </div>
          <div className="mt-1 font-mono text-lg text-fg">
            {Math.round(preview.calories)} kcal
          </div>
          <div className="mt-1 font-mono text-xs text-muted">
            C{Math.round(preview.carbs)}g · P{Math.round(preview.protein)}g · F
            {Math.round(preview.fat)}g
          </div>
        </div>

        <button
          onClick={() => onPick(ingredientFromFood(selected, n))}
          disabled={!valid}
          className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
            valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
          }`}
        >
          Add to recipe
        </button>
        <button
          onClick={() => setSelected(null)}
          className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
        >
          Pick a different food
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods…"
            className="w-full bg-transparent outline-none placeholder:text-subtle"
          />
        </div>
        <button
          onClick={() => setCreating(true)}
          className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent text-[#0a160d]"
          aria-label="New food"
        >
          <PlusIcon />
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
          {query.trim() ? (
            <>
              No matches for "{query}".{" "}
              <button
                onClick={() => setCreating(true)}
                className="text-accent-fg underline-offset-2 hover:underline"
              >
                Add as new food
              </button>
              .
            </>
          ) : (
            "No foods in your library yet."
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f)}
              className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left hover:border-border-strong active:scale-[0.995]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight text-fg">
                  {f.name}
                  {f.brand && <span className="text-muted"> · {f.brand}</span>}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {f.servingSize} · {Math.round(f.macros.calories)} kcal
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Compact new-food form shown inside the ingredient picker so users can
// create a food and add it as an ingredient without leaving the recipe flow.
function NewFoodInlineForm({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string;
  onSave: (food: NewFood) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("1 serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const valid = name.trim().length > 0 && servingSize.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      servingSize: servingSize.trim(),
      macros: {
        calories: parseNumFallback(calories),
        protein: parseNumFallback(protein),
        carbs: parseNumFallback(carbs),
        fat: parseNumFallback(fat),
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <p className="text-xs leading-relaxed text-muted">
        Saves to your food library so you can reuse it later.
      </p>
      <Field label="Name" value={name} onChange={setName} placeholder="Garlic clove" />
      <Field label="Brand (optional)" value={brand} onChange={setBrand} />
      <Field
        label="Serving size"
        value={servingSize}
        onChange={setServingSize}
        placeholder="1 clove / 100 g / 1 tbsp"
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Calories" value={calories} onChange={setCalories} numeric />
        <Field label="Protein (g)" value={protein} onChange={setProtein} numeric />
        <Field label="Carbs (g)" value={carbs} onChange={setCarbs} numeric />
        <Field label="Fat (g)" value={fat} onChange={setFat} numeric />
      </div>
      <button
        type="submit"
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Save & pick servings
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
      >
        Cancel
      </button>
    </form>
  );
}

function parseNumFallback(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/* -------------------- Log to meal -------------------- */

function LogToMealView({
  recipe,
  onConfirm,
}: {
  recipe: Recipe;
  onConfirm: (meal: MealType, servings: number) => void;
}) {
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [servings, setServings] = useState("1");
  const n = parseFloat(servings);
  const valid = !Number.isNaN(n) && n > 0;

  const perServing = perServingRecipeMacros(recipe);
  const preview = valid
    ? {
        calories: perServing.calories * n,
        carbs: perServing.carbs * n,
        protein: perServing.protein * n,
        fat: perServing.fat * n,
      }
    : perServing;

  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
        <div className="text-base font-medium leading-tight text-fg">
          {recipe.name}
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted">
          {recipe.yields} {recipe.yields === 1 ? "serving" : "servings"} total ·
          per serving {Math.round(perServing.calories)} kcal · C
          {Math.round(perServing.carbs)} P{Math.round(perServing.protein)} F
          {Math.round(perServing.fat)}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
          Meal
        </div>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_ORDER.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`rounded-[10px] border px-2 py-2 text-xs ${
                meal === m
                  ? "border-accent bg-accent-soft text-accent-fg"
                  : "border-border bg-surface text-fg hover:border-border-strong"
              }`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Servings</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={servings}
          autoFocus
          onChange={(e) => setServings(e.target.value)}
          className="w-24 rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-sm outline-none"
        />
        <div className="ml-auto flex gap-1">
          {[0.5, 1, 2].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setServings(String(q))}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-border-strong"
            >
              {q}×
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Logging
        </div>
        <div className="mt-1 font-mono text-lg text-fg">
          {Math.round(preview.calories)} kcal
        </div>
        <div className="mt-1 font-mono text-xs text-muted">
          C{Math.round(preview.carbs)}g · P{Math.round(preview.protein)}g · F
          {Math.round(preview.fat)}g
        </div>
      </div>

      <button
        onClick={() => onConfirm(meal, n)}
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Add
      </button>
    </div>
  );
}

/* -------------------- Shared -------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        step={numeric ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
      />
    </label>
  );
}

function formatServings(s: number): string {
  return Number.isInteger(s)
    ? s.toString()
    : s.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M7 1v12M1 7h12"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
