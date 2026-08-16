import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Workout, WorkoutExercise, WorkoutSet } from "../db/types";
import {
  DEFAULT_REST_SEC,
  addSet,
  discardWorkout,
  finishWorkout,
  isSetCompleted,
  removeSet,
  swapExerciseSlot,
  totalVolume,
  updateSet,
} from "../lib/fitness";
import SwapSheet from "./SwapSheet";
import RestTimer from "./RestTimer";
import ExerciseDemoScreen from "../screens/ExerciseDemoScreen";

interface Props {
  workoutId: number;
  onClose: () => void;
}

// Live workout session — opens full-screen over everything (tab bar + chat).
// Header shows elapsed / done/total sets / volume / avg RPE with a progress
// bar; each exercise gets a Swap affordance; logging a set opens a
// full-screen rest timer.
export default function WorkoutSession({ workoutId, onClose }: Props) {
  const workout = useLiveQuery(
    () => db.workouts.get(workoutId),
    [workoutId],
  );
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 260);
  };

  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [demoIdx, setDemoIdx] = useState<number | null>(null);
  const [rest, setRest] = useState<{
    seconds: number;
    exerciseName: string;
    nextLine?: string;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Live wall-clock tick since startedAt. Stops when workout is completed.
  useEffect(() => {
    if (!workout || workout.completedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - workout.startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [workout?.startedAt, workout?.completedAt]);

  const totals = useMemo(() => {
    if (!workout) return { total: 0, done: 0, volume: 0, avgRpe: null as number | null };
    let total = 0;
    let done = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    for (const ex of workout.exercises) {
      for (const s of ex.sets) {
        total++;
        if (isSetCompleted(s)) {
          done++;
          if (s.rpe !== undefined && s.rpe > 0) {
            rpeSum += s.rpe;
            rpeCount++;
          }
        }
      }
    }
    return {
      total,
      done,
      volume: Math.round(totalVolume(workout)),
      avgRpe: rpeCount > 0 ? rpeSum / rpeCount : null,
    };
  }, [workout]);

  if (!workout) return null;

  const progressPct =
    totals.total > 0 ? Math.min(100, (totals.done / totals.total) * 100) : 0;

  const onToggleSet = async (exIdx: number, setIdx: number) => {
    const ex = workout.exercises[exIdx];
    const s = ex.sets[setIdx];
    if (!s) return;
    const wasDone = isSetCompleted(s);
    await updateSet(workoutId, exIdx, setIdx, {
      completedAt: wasDone ? undefined : Date.now(),
    });
    // Only open rest timer on completion (not on un-log).
    if (!wasDone) {
      const restSec = s.restSec ?? DEFAULT_REST_SEC;
      const totalSetsHere = ex.sets.length;
      const nextIdx = setIdx + 1;
      const nextLine =
        nextIdx < totalSetsHere
          ? `Set ${nextIdx + 1} of ${totalSetsHere}`
          : "Last set complete — up next: swipe to the next exercise";
      setRest({
        seconds: restSec,
        exerciseName: ex.exerciseName,
        nextLine,
      });
    }
  };

  const onFinish = async () => {
    if (
      totals.done === 0 &&
      !confirm("Finish this workout with no completed sets?")
    ) {
      return;
    }
    await finishWorkout(workoutId);
    close();
  };

  const onDiscard = async () => {
    const msg =
      totals.done === 0
        ? "Discard this workout? Nothing was logged, so nothing is lost."
        : `Discard this workout? ${totals.done} logged set${totals.done === 1 ? "" : "s"} will be deleted — this can't be undone.`;
    if (!confirm(msg)) return;
    await discardWorkout(workoutId);
    close();
  };

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-260 ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-[18px] pb-3 pt-[52px]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-xl font-medium leading-[1.05] tracking-[-0.025em]">
              {workout.name} day
            </h1>
            <div className="mt-1 font-mono text-[11px] tracking-[0.02em] text-muted">
              {formatElapsed(elapsed)}
              {" · "}
              {totals.done}/{totals.total} sets
              {" · "}
              {totals.volume.toLocaleString()} lb
              {totals.avgRpe !== null && (
                <>
                  {" · "}
                  RPE {totals.avgRpe.toFixed(1)}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDiscard}
              className="rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-xs text-subtle hover:border-border-strong hover:text-fg"
            >
              Discard
            </button>
            <button
              onClick={onFinish}
              className="rounded-[10px] bg-accent px-3 py-1.5 text-sm font-medium text-[#0a160d]"
            >
              Finish
            </button>
            <button
              onClick={close}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-[10px] text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <XIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-full bg-surface-2">
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-[18px] pb-[80px] pt-3 [&::-webkit-scrollbar]:hidden">
        {workout.exercises.map((ex, exIdx) => (
          <ExerciseCard
            key={exIdx}
            exercise={ex}
            onSwap={() => setSwapIdx(exIdx)}
            onOpenDemo={() => setDemoIdx(exIdx)}
            onToggle={(setIdx) => onToggleSet(exIdx, setIdx)}
            onUpdate={(setIdx, patch) =>
              updateSet(workoutId, exIdx, setIdx, patch)
            }
            onAddSet={() => addSet(workoutId, exIdx)}
            onRemoveSet={(setIdx) => removeSet(workoutId, exIdx, setIdx)}
          />
        ))}
        {workout.exercises.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No exercises loaded for this workout.
          </div>
        )}
      </div>

      {swapIdx !== null && (
        <SwapSheet
          exercise={workout.exercises[swapIdx]}
          onPick={async (newName) => {
            await swapExerciseSlot(workoutId, swapIdx, newName);
            setSwapIdx(null);
          }}
          onClose={() => setSwapIdx(null)}
        />
      )}
      {rest && (
        <RestTimer
          initialSeconds={rest.seconds}
          exerciseName={rest.exerciseName}
          nextLine={rest.nextLine}
          onClose={() => setRest(null)}
        />
      )}
      {demoIdx !== null && (
        <ExerciseDemoScreen
          exerciseName={workout.exercises[demoIdx].exerciseName}
          note={workout.exercises[demoIdx].notes}
          onClose={() => setDemoIdx(null)}
        />
      )}
    </div>
  );
}

/* -------------------- Exercise card + set row -------------------- */

function ExerciseCard({
  exercise,
  onSwap,
  onOpenDemo,
  onToggle,
  onUpdate,
  onAddSet,
  onRemoveSet,
}: {
  exercise: WorkoutExercise;
  onSwap: () => void;
  onOpenDemo: () => void;
  onToggle: (setIdx: number) => void;
  onUpdate: (setIdx: number, patch: Partial<WorkoutSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
}) {
  const allDone =
    exercise.sets.length > 0 && exercise.sets.every((s) => isSetCompleted(s));
  const [tipOpen, setTipOpen] = useState(false);

  const meta = [];
  if (exercise.targetSets) {
    const rep =
      exercise.repLow !== undefined && exercise.repHigh !== undefined
        ? exercise.repLow === exercise.repHigh
          ? `${exercise.repLow}`
          : `${exercise.repLow}-${exercise.repHigh}`
        : "";
    meta.push(rep ? `${exercise.targetSets}×${rep}` : `${exercise.targetSets} sets`);
  }
  const firstSet = exercise.sets[0];
  if (firstSet?.restSec) meta.push(`${firstSet.restSec}s rest`);

  return (
    <div className="mb-3 overflow-hidden rounded-[16px] border border-border bg-surface">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`truncate text-base leading-tight ${allDone ? "text-subtle line-through" : "text-fg"}`}
            >
              {exercise.exerciseName}
            </div>
            {allDone && (
              <span className="text-accent-fg">
                <CheckSmall />
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {meta.join(" · ") || "no prescription"}
            {exercise.swappedFrom && (
              <>
                {" · "}
                <span className="text-subtle">
                  swapped from {exercise.swappedFrom}
                </span>
              </>
            )}
          </div>
          {exercise.notes && (
            <button
              onClick={() => setTipOpen((v) => !v)}
              className="mt-1 flex items-center gap-1 font-mono text-[10px] text-subtle hover:text-fg"
            >
              <span>{tipOpen ? "▾" : "▸"}</span>
              <span>Tip</span>
            </button>
          )}
          {tipOpen && exercise.notes && (
            <div className="mt-1.5 rounded-[8px] border border-border bg-bg px-2.5 py-2 font-mono text-[10px] leading-snug text-muted">
              {exercise.notes}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={onOpenDemo}
            className="rounded-[8px] border border-border bg-bg px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
          >
            How to
          </button>
          <button
            onClick={onSwap}
            className="rounded-[8px] border border-border bg-bg px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
          >
            ⇄ Swap
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px_28px] items-center gap-2 border-t border-border bg-surface-2/40 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">
        <span>set</span>
        <span>lb</span>
        <span>reps</span>
        <span>rpe</span>
        <span></span>
        <span></span>
      </div>

      {exercise.sets.map((s, i) => (
        <SetRow
          key={i}
          index={i}
          set={s}
          onToggle={() => onToggle(i)}
          onUpdate={(patch) => onUpdate(i, patch)}
          onRemove={() => onRemoveSet(i)}
        />
      ))}

      <button
        onClick={onAddSet}
        className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2 text-xs font-medium text-accent-fg hover:bg-surface-2"
      >
        + Add set
      </button>
    </div>
  );
}

function SetRow({
  index,
  set,
  onToggle,
  onUpdate,
  onRemove,
}: {
  index: number;
  set: WorkoutSet;
  onToggle: () => void;
  onUpdate: (patch: Partial<WorkoutSet>) => void;
  onRemove: () => void;
}) {
  const done = isSetCompleted(set);
  const [wDraft, setWDraft] = useState(set.weight ? String(set.weight) : "");
  const [rDraft, setRDraft] = useState(set.reps ? String(set.reps) : "");
  const [rpeDraft, setRpeDraft] = useState(
    set.rpe !== undefined ? String(set.rpe) : "",
  );
  // Keep local drafts in sync when Dexie value changes (e.g., addSet copies
  // last set's weight and reps).
  useEffect(() => {
    setWDraft(set.weight ? String(set.weight) : "");
  }, [set.weight]);
  useEffect(() => {
    setRDraft(set.reps ? String(set.reps) : "");
  }, [set.reps]);
  useEffect(() => {
    setRpeDraft(set.rpe !== undefined ? String(set.rpe) : "");
  }, [set.rpe]);

  return (
    <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px_28px] items-center gap-2 border-t border-border px-3.5 py-2">
      <span className="font-mono text-[11px] text-subtle">{index + 1}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={wDraft}
        onChange={(e) => setWDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(wDraft);
          onUpdate({ weight: Number.isNaN(v) ? 0 : v });
        }}
        className="w-full min-w-0 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm outline-none"
      />
      <input
        type="number"
        inputMode="numeric"
        step="1"
        value={rDraft}
        onChange={(e) => setRDraft(e.target.value)}
        onBlur={() => {
          const v = parseInt(rDraft, 10);
          onUpdate({ reps: Number.isNaN(v) ? 0 : v });
        }}
        className="w-full min-w-0 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm outline-none"
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min="5"
        max="10"
        placeholder="—"
        value={rpeDraft}
        onChange={(e) => setRpeDraft(e.target.value)}
        onBlur={() => {
          if (rpeDraft.trim() === "") {
            onUpdate({ rpe: undefined });
            return;
          }
          const v = parseFloat(rpeDraft);
          if (Number.isNaN(v)) return;
          onUpdate({ rpe: Math.max(5, Math.min(10, v)) });
        }}
        className="w-full min-w-0 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle"
      />
      <button
        onClick={onToggle}
        aria-label={done ? "Unlog set" : "Log set"}
        className={`grid h-7 w-7 place-items-center rounded-[7px] border-[1.5px] ${
          done
            ? "border-accent bg-accent text-[#0a160d]"
            : "border-border-strong text-subtle hover:text-fg"
        }`}
      >
        {done ? <CheckSmall /> : null}
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove set"
        className="grid h-7 w-7 place-items-center rounded-[7px] text-subtle opacity-40 hover:bg-surface-2 hover:opacity-100"
      >
        <XIcon />
      </button>
    </div>
  );
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CheckSmall = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path
      d="M2.5 6.5L5 9L9.5 3.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path
      d="M2 2l7 7M9 2l-7 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
