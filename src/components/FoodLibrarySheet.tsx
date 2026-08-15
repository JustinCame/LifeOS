import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Food } from "../db/types";
import { addFood, deleteFood, updateFood, type NewFood } from "../lib/macros";

interface Props {
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function FoodLibrarySheet({ onClose }: Props) {
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

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
          {editing || creating ? (
            <button
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
              className="text-base text-accent-fg"
            >
              ← Back
            </button>
          ) : (
            <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
              Food library
            </span>
          )}
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>
        {(editing || creating) && (
          <div className="px-[18px] pb-1 text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {creating ? "New food" : "Edit food"}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {creating ? (
            <NewFoodInlineForm
              initialName={query}
              onSave={async (payload) => {
                await addFood(payload);
                setCreating(false);
                setQuery("");
              }}
              onCancel={() => setCreating(false)}
            />
          ) : editing ? (
            <EditFoodForm
              key={editing.id}
              food={editing}
              onSave={async (updates) => {
                await updateFood(editing.id!, updates);
                setEditing(null);
              }}
              onDelete={async () => {
                if (confirm(`Delete "${editing.name}" from library?`)) {
                  await deleteFood(editing.id!);
                  setEditing(null);
                }
              }}
            />
          ) : (
            <div className="space-y-4">
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

              <div className="font-mono text-[11px] text-subtle">
                {foods.length}{" "}
                {foods.length === 1 ? "food" : "foods"} · tap any to edit
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
                    <>
                      No foods saved yet.{" "}
                      <button
                        onClick={() => setCreating(true)}
                        className="text-accent-fg underline-offset-2 hover:underline"
                      >
                        Add your first food
                      </button>
                      .
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((f) => (
                    <FoodRow
                      key={f.id}
                      food={f}
                      onClick={() => setEditing(f)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FoodRow({ food, onClick }: { food: Food; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left hover:border-border-strong active:scale-[0.995]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight text-fg">
          {food.name}
          {food.brand && <span className="text-muted"> · {food.brand}</span>}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {food.servingSize} · {Math.round(food.macros.calories)} kcal · C
          {Math.round(food.macros.carbs)} P{Math.round(food.macros.protein)} F
          {Math.round(food.macros.fat)}
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

interface FoodUpdates {
  name: string;
  brand?: string;
  servingSize: string;
  servingGrams?: number;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  notes?: string;
  barcode?: string;
}

function EditFoodForm({
  food,
  onSave,
  onDelete,
}: {
  food: Food;
  onSave: (updates: FoodUpdates) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(food.name);
  const [brand, setBrand] = useState(food.brand ?? "");
  const [servingSize, setServingSize] = useState(food.servingSize);
  const [calories, setCalories] = useState(String(food.macros.calories));
  const [protein, setProtein] = useState(String(food.macros.protein));
  const [carbs, setCarbs] = useState(String(food.macros.carbs));
  const [fat, setFat] = useState(String(food.macros.fat));

  const valid = name.trim().length > 0 && servingSize.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      servingSize: servingSize.trim(),
      ...(food.servingGrams !== undefined
        ? { servingGrams: food.servingGrams }
        : {}),
      macros: {
        calories: parseNum(calories),
        protein: parseNum(protein),
        carbs: parseNum(carbs),
        fat: parseNum(fat),
      },
      ...(food.notes ? { notes: food.notes } : {}),
      ...(food.barcode ? { barcode: food.barcode } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Brand (optional)" value={brand} onChange={setBrand} />
      <Field
        label="Serving size"
        value={servingSize}
        onChange={setServingSize}
        placeholder="1 medium / 100 g / 1 cup"
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Calories" value={calories} onChange={setCalories} numeric />
        <Field label="Protein (g)" value={protein} onChange={setProtein} numeric />
        <Field label="Carbs (g)" value={carbs} onChange={setCarbs} numeric />
        <Field label="Fat (g)" value={fat} onChange={setFat} numeric />
      </div>

      {food.useCount > 0 && (
        <div className="rounded-[10px] border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted">
          Logged {food.useCount} {food.useCount === 1 ? "time" : "times"}.
          Editing only updates this food going forward — past meal entries keep
          the macros they were logged with.
        </div>
      )}

      <button
        type="submit"
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Save changes
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
      >
        Delete from library
      </button>
    </form>
  );
}

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

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

// Compact new-food form shown when the user taps + on the library sheet.
// Adds to the library only; no meal-entry side effect.
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
        calories: parseNum(calories),
        protein: parseNum(protein),
        carbs: parseNum(carbs),
        fat: parseNum(fat),
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <p className="text-xs leading-relaxed text-muted">
        Saves to your library so you can log it any time. Won't touch today's
        macros.
      </p>
      <Field label="Name" value={name} onChange={setName} placeholder="Chicken breast" />
      <Field label="Brand (optional)" value={brand} onChange={setBrand} />
      <Field
        label="Serving size"
        value={servingSize}
        onChange={setServingSize}
        placeholder="4 oz / 100 g / 1 cup"
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
        Save to library
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
