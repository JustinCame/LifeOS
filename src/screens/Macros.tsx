import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import FoodPickerSheet from "../components/FoodPickerSheet";
import FoodLibrarySheet from "../components/FoodLibrarySheet";
import RecipeLibrarySheet from "../components/RecipeLibrarySheet";
import MealEntryEditSheet from "../components/MealEntryEditSheet";
import QuickAddSheet from "../components/QuickAddSheet";
import ExportSheet from "../components/ExportSheet";
import InsightCard from "../components/InsightCard";
import { exportMacrosText } from "../lib/exports";
import { db } from "../db";
import type { InsightSeverity, MealEntry } from "../db/types";
import { markSeen } from "../lib/insights/engine";
import { startOfToday } from "../lib/health";
import {
  MEAL_LABELS,
  MEAL_ORDER,
  MACRO_GOALS,
  deleteMealEntry,
  getMacroGoal,
  setMacroGoal,
  sumMacros,
  ZERO_MACROS,
  type MacroKey,
  type MealType,
} from "../lib/macros";

export default function Macros() {
  const today = startOfToday();
  const [selectedDay, setSelectedDay] = useState<number>(today);
  const isToday = selectedDay === today;

  const adjustDay = (delta: number) => (d: number) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + delta);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  };
  const goToPrevDay = () => setSelectedDay(adjustDay(-1));
  const goToNextDay = () => {
    if (selectedDay >= today) return;
    setSelectedDay(adjustDay(1));
  };

  const entries =
    useLiveQuery(
      () => db.meal_entries.where("date").equals(selectedDay).toArray(),
      [selectedDay],
    ) ?? [];

  const goals =
    useLiveQuery(async () => {
      const [calories, protein, carbs, fat] = await Promise.all([
        getMacroGoal("calories"),
        getMacroGoal("protein"),
        getMacroGoal("carbs"),
        getMacroGoal("fat"),
      ]);
      return { calories, protein, carbs, fat };
    }) ?? {
      calories: MACRO_GOALS.calories.default,
      protein: MACRO_GOALS.protein.default,
      carbs: MACRO_GOALS.carbs.default,
      fat: MACRO_GOALS.fat.default,
    };

  const totals = entries.length > 0 ? sumMacros(entries) : ZERO_MACROS;

  const [pickerMeal, setPickerMeal] = useState<MealType | null>(null);
  const [editGoals, setEditGoals] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  // Default to "remaining" — answers the more useful question mid-day
  // ("how much can I still eat?"). Tap any of the values to flip to "eaten".
  const [viewMode, setViewMode] = useState<"remaining" | "eaten">("remaining");
  const toggleView = () =>
    setViewMode((m) => (m === "remaining" ? "eaten" : "remaining"));

  const foodCount = useLiveQuery(() => db.foods.count()) ?? 0;
  const recipeCount = useLiveQuery(() => db.recipes.count()) ?? 0;

  // --- Insights (passive layer, surface: macros_header) ---
  // Only render on today (past-day views are read-only; insights don't apply).
  const insights =
    useLiveQuery(async () => {
      if (!isToday) return [];
      const rows = await db.insights
        .where("status")
        .anyOf(["new", "seen"])
        .toArray();
      const rank: Record<InsightSeverity, number> = {
        urgent: 2,
        notable: 1,
        info: 0,
      };
      return rows
        .filter((i) => i.surface === "macros_header")
        .sort((a, b) => {
          const s = rank[b.severity] - rank[a.severity];
          return s !== 0 ? s : b.createdAt - a.createdAt;
        })
        .slice(0, 2);
    }, [isToday]) ?? [];

  const insightsSignature = insights
    .map((i) => `${i.id}:${i.status}`)
    .join(",");
  useEffect(() => {
    const newIds = insights
      .filter((i) => i.status === "new" && i.id !== undefined)
      .map((i) => i.id!);
    if (newIds.length > 0) void markSeen(newIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsSignature]);

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-4 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              Macros
            </h1>
            <button
              onClick={() => setExportOpen(true)}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
            >
              Export
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2 font-mono text-xs tracking-[0.02em] text-muted">
            <button onClick={toggleView} className="text-muted hover:text-fg">
              {viewMode === "remaining"
                ? `${formatRemaining(goals.calories - totals.calories)} kcal left`
                : `${Math.round(totals.calories)} / ${goals.calories} kcal`}
            </button>
            <span>·</span>
            <button
              onClick={() => setEditGoals((v) => !v)}
              className="text-subtle hover:text-fg"
            >
              {editGoals ? "done" : "edit goals"}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={goToPrevDay}
              aria-label="Previous day"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
            >
              ‹
            </button>
            <div className="font-mono text-sm text-fg">
              {formatDateNumeric(selectedDay)}
            </div>
            <button
              onClick={goToNextDay}
              disabled={isToday}
              aria-label="Next day"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </header>

        {editGoals ? (
          <GoalsEditor
            goals={goals}
            onClose={() => setEditGoals(false)}
          />
        ) : (
          <Card>
            <div className="grid grid-cols-3 gap-3 px-3.5 py-3.5">
              <MacroBar
                label="Carbs"
                value={totals.carbs}
                goal={goals.carbs}
                mode={viewMode}
                onToggle={toggleView}
              />
              <MacroBar
                label="Protein"
                value={totals.protein}
                goal={goals.protein}
                mode={viewMode}
                onToggle={toggleView}
              />
              <MacroBar
                label="Fat"
                value={totals.fat}
                goal={goals.fat}
                mode={viewMode}
                onToggle={toggleView}
              />
            </div>
            <button
              onClick={toggleView}
              className="block w-full border-t border-border px-3.5 py-2.5 text-left hover:bg-surface-2"
            >
              <div className="font-mono text-xs uppercase tracking-[0.04em] text-muted">
                calories
              </div>
              <div className="mt-1 font-mono text-base">
                {viewMode === "remaining" ? (
                  <>
                    {formatRemaining(goals.calories - totals.calories)}
                    <span className="ml-1 text-xs text-subtle">
                      {goals.calories - totals.calories < 0 ? "over" : "left"}
                    </span>
                  </>
                ) : (
                  <>
                    {Math.round(totals.calories)}
                    <span className="ml-1 text-xs text-subtle">
                      / {goals.calories}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
                <span
                  className="block h-full bg-accent"
                  style={{
                    width: `${Math.min(100, (totals.calories / Math.max(1, goals.calories)) * 100)}%`,
                  }}
                />
              </div>
            </button>
          </Card>
        )}

        {/* Insights (passive layer). Silent when nothing's worth saying. */}
        {insights.length > 0 && (
          <div className="mt-[22px] space-y-2">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        )}

        {MEAL_ORDER.map((meal) => {
          const mealEntries = entries.filter((e) => e.type === meal);
          const mealTotals = mealEntries.length > 0 ? sumMacros(mealEntries) : ZERO_MACROS;
          return (
            <Section
              key={meal}
              title={MEAL_LABELS[meal]}
              meta={`${Math.round(mealTotals.calories)} kcal`}
            >
              <Card>
                {mealEntries.length === 0 && (
                  <div className="px-3.5 py-3 text-sm text-muted">
                    Nothing logged.
                  </div>
                )}
                {mealEntries.map((e) => (
                  <div
                    key={e.id}
                    className="group flex items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0"
                  >
                    <button
                      onClick={() => setEditingEntry(e)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Edit ${e.foodName} servings`}
                    >
                      <div className="text-base leading-tight">{e.foodName}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted">
                        {e.servings !== 1 && (
                          <span>{formatServings(e.servings)}× · </span>
                        )}
                        {Math.round(e.macros.calories)} kcal · C
                        {Math.round(e.macros.carbs)} P
                        {Math.round(e.macros.protein)} F
                        {Math.round(e.macros.fat)}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteMealEntry(e.id!)}
                      className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
                      aria-label="Remove"
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setPickerMeal(meal)}
                  className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"
                >
                  <PlusInCircle />
                  Add food
                </button>
              </Card>
            </Section>
          );
        })}

        <Section title="Library" meta={foodCount > 0 ? `${foodCount}` : ""}>
          <Card>
            <button
              onClick={() => setLibraryOpen(true)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Browse food library
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {foodCount === 0
                    ? "No foods yet — add some via + Add food above."
                    : `${foodCount} ${foodCount === 1 ? "food" : "foods"} · tap any to edit`}
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          </Card>
        </Section>

        <Section title="Recipes" meta={recipeCount > 0 ? `${recipeCount}` : ""}>
          <Card>
            <button
              onClick={() => setRecipesOpen(true)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Browse recipes
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {recipeCount === 0
                    ? "No recipes yet — build one from foods in your library."
                    : `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"} · tap any to edit or log to a meal`}
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          </Card>
        </Section>

        <Section title="Quick add">
          <Card>
            <button
              onClick={() => setQuickAddOpen(true)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Log macros without saving
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  For random one-off items you won't have again.
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          </Card>
        </Section>
      </div>

      {pickerMeal !== null && (
        <FoodPickerSheet
          meal={pickerMeal}
          date={selectedDay}
          onClose={() => setPickerMeal(null)}
        />
      )}

      {exportOpen && (
        <ExportSheet
          title="Food library"
          generate={exportMacrosText}
          onClose={() => setExportOpen(false)}
        />
      )}

      {libraryOpen && (
        <FoodLibrarySheet onClose={() => setLibraryOpen(false)} />
      )}

      {recipesOpen && (
        <RecipeLibrarySheet
          logDate={selectedDay}
          onClose={() => setRecipesOpen(false)}
        />
      )}

      {quickAddOpen && (
        <QuickAddSheet
          date={selectedDay}
          onClose={() => setQuickAddOpen(false)}
        />
      )}

      {editingEntry && (
        <MealEntryEditSheet
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}

// Numeric date: "5/8" when this year, "5/8/2025" otherwise.
function formatDateNumeric(ts: number): string {
  const d = new Date(ts);
  const nowYear = new Date().getFullYear();
  if (d.getFullYear() === nowYear) {
    return d.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------- Sub-components -------------------- */

function MacroBar({
  label,
  value,
  goal,
  mode,
  onToggle,
}: {
  label: string;
  value: number;
  goal: number;
  mode: "remaining" | "eaten";
  onToggle: () => void;
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const remaining = goal - value;
  const over = remaining < 0;
  return (
    <button onClick={onToggle} className="min-w-0 text-left">
      <div className="text-xs uppercase tracking-[0.04em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-[15px] tracking-[-0.01em]">
        {mode === "remaining" ? (
          <>
            {formatRemaining(remaining)}
            <span className="text-xs text-muted">g</span>
            <span className="ml-1 text-xs text-subtle">
              {over ? "over" : "left"}
            </span>
          </>
        ) : (
          <>
            {Math.round(value)}
            <span className="text-xs text-muted">g</span>
            <span className="ml-1 text-xs text-subtle"> / {goal}g</span>
          </>
        )}
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
        <span
          className="block h-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

// "+200" when over goal, "1200" when under. Always returns a positive
// magnitude string; the label ("left" / "over") provides the sign.
function formatRemaining(n: number): string {
  return Math.round(Math.abs(n)).toString();
}

function GoalsEditor({
  goals, onClose,
}: {
  goals: { calories: number; protein: number; carbs: number; fat: number };
  onClose: () => void;
}) {
  const [calories, setCalories] = useState(String(goals.calories));
  const [protein, setProtein] = useState(String(goals.protein));
  const [carbs, setCarbs] = useState(String(goals.carbs));
  const [fat, setFat] = useState(String(goals.fat));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updates: [MacroKey, string][] = [
      ["calories", calories],
      ["protein", protein],
      ["carbs", carbs],
      ["fat", fat],
    ];
    for (const [key, val] of updates) {
      const n = parseFloat(val);
      if (!Number.isNaN(n) && n > 0) await setMacroGoal(key, n);
    }
    onClose();
  };

  return (
    <form onSubmit={save} className="space-y-2 rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="text-xs uppercase tracking-[0.06em] text-muted">Daily goals</div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Calories" value={calories} onChange={setCalories} unit="" />
        <NumField label="Protein" value={protein} onChange={setProtein} unit="g" />
        <NumField label="Carbs" value={carbs} onChange={setCarbs} unit="g" />
        <NumField label="Fat" value={fat} onChange={setFat} unit="g" />
      </div>
      <button
        type="submit"
        className="w-full rounded-[10px] bg-accent py-2 text-sm font-medium text-[#0a160d]"
      >
        Save goals
      </button>
    </form>
  );
}

function NumField({
  label, value, onChange, unit,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  unit: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[8px] border border-border bg-bg px-2.5 py-1.5 text-sm outline-none"
      />
    </label>
  );
}

function formatServings(s: number): string {
  return Number.isInteger(s) ? s.toString() : s.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const PlusInCircle = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
