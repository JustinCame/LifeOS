import { useEffect, useState } from "react";
import {
  MEAL_LABELS,
  MEAL_ORDER,
  addQuickMealEntry,
  type MealType,
} from "../lib/macros";

interface Props {
  // Day the entry lands on. Passed from Macros so the sheet respects whichever
  // day the user was browsing.
  date: number;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function QuickAddSheet({ date, onClose }: Props) {
  // Snacks are the most common quick-add scenario (random treat, coffee shop
  // cookie), so default there.
  const [meal, setMeal] = useState<MealType>("snack");
  const [label, setLabel] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);

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

  const cal = parseNum(calories);
  const p = parseNum(protein);
  const c = parseNum(carbs);
  const f = parseNum(fat);
  // Require at least something numeric to save — otherwise "Add" is a no-op.
  const valid = cal > 0 || p > 0 || c > 0 || f > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await addQuickMealEntry(
        meal,
        { calories: cal, protein: p, carbs: c, fat: f },
        label,
        date,
      );
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
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
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Quick add
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <form
          onSubmit={save}
          className="flex flex-col gap-4 px-[18px] pb-6 pt-2"
        >
          <p className="text-xs leading-relaxed text-muted">
            Log macros without saving a food. Good for random one-off items you
            won't have again.
          </p>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              Meal
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MEAL_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
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

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Label (optional)
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. random cookie"
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Calories"
              value={calories}
              onChange={setCalories}
              autoFocus
            />
            <NumField label="Protein (g)" value={protein} onChange={setProtein} />
            <NumField label="Carbs (g)" value={carbs} onChange={setCarbs} />
            <NumField label="Fat (g)" value={fat} onChange={setFat} />
          </div>

          <button
            type="submit"
            disabled={!valid || busy}
            className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
              valid && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            Add
          </button>
        </form>
      </div>
    </>
  );
}

function NumField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}
