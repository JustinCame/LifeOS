import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { logPastWorkout } from "../lib/fitness";
import { LIFTS } from "../lib/userProgram";

interface Props {
  onCreated: (workoutId: number) => void;
  onClose: () => void;
}

const TRANSITION_MS = 280;

// Bottom sheet for logging a workout that already happened. Creates a
// backdated, already-completed workout — optionally pre-loaded from the
// matching template — then the parent opens it in WorkoutSheet so the user
// can fill in weights/reps.
export default function BacklogWorkoutSheet({ onCreated, onClose }: Props) {
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

  // Default to yesterday. Native date input takes YYYY-MM-DD in the local
  // timezone so a fresh Date parse works cleanly.
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateInput(d);
  });
  const [liftKey, setLiftKey] = useState<string>("freeform");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  // We need the template ID matching the chosen lift so logPastWorkout can
  // seed exercises. Look it up by name.
  const templates =
    useLiveQuery(() => db.workout_templates.toArray()) ?? [];

  const parsedDur = parseFloat(duration);
  const durValid = !Number.isNaN(parsedDur) && parsedDur > 0;
  const dateValid = !!dateStr;
  const valid = dateValid && durValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const lift = LIFTS.find((l) => l.key === liftKey);
      const template = lift
        ? templates.find((t) => t.name === lift.templateName)
        : undefined;
      // Local-date parse — dateStr is YYYY-MM-DD.
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateMs = new Date(y, m - 1, d, 12, 0, 0).getTime();
      const id = await logPastWorkout({
        name: lift ? lift.name : "Workout",
        dateMs,
        durationMin: parsedDur,
        templateId: template?.id,
      });
      onCreated(id);
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
            Log past workout
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
            Creates a backdated, completed workout. Fill in the weights and
            reps in the next screen — the template just seeds the exercise
            slots.
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
              Lift
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: "freeform", label: "Freeform" },
                ...LIFTS.map((l) => ({ key: l.key, label: l.name })),
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLiftKey(opt.key)}
                  className={`rounded-[8px] px-2 py-1.5 text-xs font-medium ${
                    liftKey === opt.key
                      ? "bg-accent-soft text-accent-fg"
                      : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Duration (minutes)
            </span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!valid || busy}
            className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
              valid && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            Create and open
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
