import { useEffect, useState } from "react";
import type { Habit } from "../db/types";
import { setHabitValue, startOfDay } from "../lib/habits";

interface Props {
  habit: Habit;
  onClose: () => void;
}

const TRANSITION_MS = 280;

// Log a past day's value for a habit. Uses the existing setHabitValue helper
// which already accepts a date param and upserts the [habitId+date] entry.
export default function BacklogHabitSheet({ habit, onClose }: Props) {
  const [shown, setShown] = useState(false);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => setInteractive(true), 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
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

  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateInput(d);
  });
  // Value semantics vary by kind. Binary/avoid: 0 or 1. Count/duration: raw.
  const isBinaryish = habit.kind === "binary" || habit.kind === "avoid";
  const target = habit.target ?? 1;
  const [value, setValue] = useState<string>(isBinaryish ? "1" : String(target));
  const [busy, setBusy] = useState(false);

  const parsedVal = parseFloat(value);
  const valValid = !Number.isNaN(parsedVal) && parsedVal >= 0;
  const valid = !!dateStr && valValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateMs = startOfDay(new Date(y, m - 1, d, 12).getTime());
      await setHabitValue(habit, parsedVal, dateMs);
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={interactive ? close : undefined}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        } ${interactive ? "" : "pointer-events-none"}`}
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
            Log past day · {habit.name}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-[18px] pb-6 pt-2"
        >
          <p className="text-xs leading-relaxed text-muted">
            {habit.linkedMetric
              ? habit.linkedMetric === "workout"
                ? "This habit is workout-linked — logging a past day here won't create a fake workout, only fill the habit ring."
                : `This habit is linked to ${habit.linkedMetric} — this writes the value to the linked log, which updates the habit ring automatically.`
              : "Fills in a habit entry for the day you pick."}
          </p>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Date
            </span>
            <input
              type="date"
              value={dateStr}
              max={toDateInput(new Date())}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              {isBinaryish
                ? habit.kind === "avoid"
                  ? "Kept or broken"
                  : "Done or not"
                : `Value${habit.unit ? ` (${habit.unit})` : ""}`}
            </div>
            {isBinaryish ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setValue("1")}
                  className={`rounded-[10px] border py-2 text-sm font-medium ${
                    parsedVal >= 1
                      ? "border-accent bg-accent-soft text-accent-fg"
                      : "border-border bg-surface text-fg"
                  }`}
                >
                  {habit.kind === "avoid" ? "Broken" : "Done"}
                </button>
                <button
                  type="button"
                  onClick={() => setValue("0")}
                  className={`rounded-[10px] border py-2 text-sm font-medium ${
                    parsedVal < 1
                      ? "border-accent bg-accent-soft text-accent-fg"
                      : "border-border bg-surface text-fg"
                  }`}
                >
                  {habit.kind === "avoid" ? "Kept" : "Skip"}
                </button>
              </div>
            ) : (
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-sm outline-none"
              />
            )}
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
            Save
          </button>
        </form>
      </div>
    </>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
