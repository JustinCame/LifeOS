import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Workout, WorkoutExercise, WorkoutSet } from "../db/types";
import {
  DEFAULT_REST_SEC,
  addSet,
  bestSetForExercise,
  cloneWorkout,
  completedSetCount,
  countPRsInWorkout,
  deleteWorkout,
  discardWorkout,
  e1RM,
  finishWorkout,
  formatDuration,
  formatRestTime,
  formatTarget,
  isSetCompleted,
  removeExerciseFromWorkout,
  removeSet,
  renameWorkout,
  setWorkoutSummary,
  totalReps,
  totalVolume,
  updateSet,
  workoutToCoachPrompt,
} from "../lib/fitness";
import { generateText } from "../lib/anthropic";
import { fireLocalNotification } from "../lib/notifications";
import ExercisePickerSheet from "./ExercisePickerSheet";
import ExerciseHistorySheet from "./ExerciseHistorySheet";

interface Props {
  // Parent only mounts the sheet when a workout is active — no "closed" state inside.
  workoutId: number;
  onClose: () => void;
  onSwitchWorkout?: (newId: number) => void;
}

const TRANSITION_MS = 280;

export default function WorkoutSheet({ workoutId, onClose, onSwitchWorkout }: Props) {
  const id = workoutId;
  const workout = useLiveQuery(
    () => db.workouts.get(id),
    [id],
  );

  // Slide-in animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(handle);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const isActive = workout?.completedAt === undefined;

  // Past-exercise lookup: previous completed sets for each exerciseId,
  // shown as "prev" hints next to today's sets.
  const previousByExerciseId =
    useLiveQuery(async () => {
      const all = await db.workouts
        .orderBy("date")
        .reverse()
        .toArray();
      const map: Record<number, WorkoutSet[]> = {};
      for (const w of all) {
        if (w.id === id) continue;
        if (w.completedAt === undefined) continue;
        for (const ex of w.exercises) {
          if (ex.exerciseId === undefined) continue;
          if (map[ex.exerciseId]) continue;
          const completed = ex.sets.filter(isSetCompleted);
          if (completed.length === 0) continue;
          map[ex.exerciseId] = completed;
        }
      }
      return map;
    }, [id]) ?? {};

  const [pickerOpenWorkoutId, setPickerOpenWorkoutId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Per-exercise history sub-sheet state
  const [historyTarget, setHistoryTarget] = useState<{ id: number; name: string } | null>(null);

  // AI summary state
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // All workouts (for PR comparisons inside an active workout)
  const allWorkouts = useLiveQuery(() => db.workouts.toArray()) ?? [];

  // Rest timer state
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());

  useEffect(() => {
    if (restEndsAt === null) return;
    const tick = () => {
      const remaining = restEndsAt - Date.now();
      if (remaining <= 0) {
        setRestEndsAt(null);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate?.(200); } catch { /* noop */ }
        }
        fireLocalNotification("Rest done", "Ready for your next set.");
      } else {
        setTickNow(Date.now());
      }
    };
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [restEndsAt]);

  // Reset rest timer when workout switches.
  useEffect(() => {
    setRestEndsAt(null);
    setEditingName(false);
  }, [id]);

  const restRemaining =
    restEndsAt !== null ? Math.max(0, Math.ceil((restEndsAt - tickNow) / 1000)) : 0;

  const onToggleSet = async (
    exerciseIndex: number,
    setIndex: number,
    set: WorkoutSet,
  ) => {
    if (isSetCompleted(set)) {
      await updateSet(id, exerciseIndex, setIndex, { completedAt: undefined });
    } else {
      const completedAt = Date.now();
      await updateSet(id, exerciseIndex, setIndex, { completedAt });
      // Auto-start rest timer — honor the set's prescribed rest if it has one.
      const restSec = set.restSec ?? DEFAULT_REST_SEC;
      setRestEndsAt(Date.now() + restSec * 1000);

      // PR notification — if this set's e1RM beats every prior set of this
      // exercise, surface it as a notification (helpful on the lock screen
      // mid-workout).
      const ex = workout?.exercises[exerciseIndex];
      const exId = ex?.exerciseId;
      if (exId !== undefined) {
        const completedSet = { ...set, completedAt };
        const newE1RM = e1RM(completedSet);
        const priorBest = priorBestByExerciseId.get(exId) ?? 0;
        if (newE1RM > 0 && newE1RM > priorBest) {
          fireLocalNotification(
            "PR set",
            `${ex.exerciseName}: ${set.reps}×${Math.round(set.weight)} lb`,
          );
        }
      }
    }
  };

  const onFinish = async () => {
    if (!workout) return;
    if (workout.exercises.length === 0) {
      if (!confirm("This workout has no exercises. Finish anyway?")) return;
    }
    await finishWorkout(id);
    close();
  };

  const onDiscard = async () => {
    if (!workout) return;
    if (!confirm("Discard this workout? It won't be saved.")) return;
    await discardWorkout(id);
    close();
  };

  const onDelete = async () => {
    if (!workout) return;
    if (!confirm(`Delete "${workout.name}"? This is permanent.`)) return;
    await deleteWorkout(id);
    close();
  };

  const saveNameEdit = async () => {
    await renameWorkout(id, nameDraft);
    setEditingName(false);
  };

  const stats = useMemo(() => {
    if (!workout) return { volume: 0, reps: 0, sets: 0 };
    return {
      volume: totalVolume(workout),
      reps: totalReps(workout),
      sets: completedSetCount(workout),
    };
  }, [workout]);

  const prCount = useMemo(() => {
    if (!workout) return 0;
    return countPRsInWorkout(workout, allWorkouts as Workout[]);
  }, [workout, allWorkouts]);

  // Best-prior-set per exercise, used to flag PR sets in real time.
  const priorBestByExerciseId = useMemo(() => {
    const m = new Map<number, number>();
    if (!workout) return m;
    for (const ex of workout.exercises) {
      if (ex.exerciseId === undefined) continue;
      const best = bestSetForExercise(
        allWorkouts as Workout[],
        ex.exerciseId,
        workout.id,
      );
      m.set(ex.exerciseId, best?.e1rm ?? 0);
    }
    return m;
  }, [workout, allWorkouts]);

  const onSummarize = async () => {
    if (id === null || !workout) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const summary = await generateText(
        "You are a strength coach reviewing a workout. Give a concise 2-3 sentence summary covering total volume, notable sets (PRs, hardest set), and one observation or suggestion. Be direct, no filler.",
        workoutToCoachPrompt(workout),
        400,
      );
      await setWorkoutSummary(id, summary);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const onRepeat = async () => {
    const newId = await cloneWorkout(id);
    if (onSwitchWorkout) onSwitchWorkout(newId);
    else close();
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
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[94%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2 pt-3.5">
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Close
          </button>
          {isActive ? (
            <button
              onClick={onFinish}
              className="rounded-[8px] bg-accent px-3 py-1 text-sm font-medium text-[#0a160d]"
            >
              Finish
            </button>
          ) : (
            <button
              onClick={close}
              className="px-1.5 py-1 text-base text-accent-fg"
            >
              Done
            </button>
          )}
        </div>

        {workout ? (
          <>
            {/* Title + stats */}
            <div className="px-[18px] pb-2">
              {editingName ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveNameEdit(); }}
                  className="flex items-center gap-2"
                >
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveNameEdit}
                    className="flex-1 rounded-[8px] border border-border bg-surface px-2 py-1 text-2xl font-medium tracking-[-0.025em] text-fg outline-none"
                  />
                </form>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(workout.name);
                    setEditingName(true);
                  }}
                  className="text-left"
                >
                  <h2 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em] text-fg">
                    {workout.name}
                  </h2>
                </button>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted">
                <span>
                  {new Date(workout.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {workout.durationSec && (
                  <span>{formatDuration(workout.durationSec)}</span>
                )}
                <span>{stats.sets} sets</span>
                <span>{Math.round(stats.volume).toLocaleString()} lb</span>
                <span>{stats.reps} reps</span>
                {prCount > 0 && (
                  <span className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-accent-fg">
                    {prCount} PR{prCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-[18px] pb-[120px] pt-2 [&::-webkit-scrollbar]:hidden">
              {workout.exercises.length === 0 && (
                <div className="my-4 rounded-[16px] border border-dashed border-border bg-surface px-5 py-6 text-center text-sm text-muted">
                  No exercises yet — tap "+ Add Exercise" below.
                </div>
              )}

              {workout.exercises.map((ex, exIdx) => (
                <ExerciseBlock
                  key={`${exIdx}-${ex.exerciseId ?? ex.exerciseName}`}
                  exercise={ex}
                  exerciseIndex={exIdx}
                  workoutId={id}
                  previousSets={
                    ex.exerciseId !== undefined
                      ? previousByExerciseId[ex.exerciseId] ?? []
                      : []
                  }
                  priorBestE1RM={
                    ex.exerciseId !== undefined
                      ? priorBestByExerciseId.get(ex.exerciseId) ?? 0
                      : 0
                  }
                  onToggleSet={onToggleSet}
                  onOpenHistory={() => {
                    if (ex.exerciseId !== undefined) {
                      setHistoryTarget({ id: ex.exerciseId, name: ex.exerciseName });
                    }
                  }}
                />
              ))}

              <button
                onClick={() => setPickerOpenWorkoutId(id)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-sm font-medium text-fg hover:border-border-strong"
              >
                <PlusInCircle /> Add exercise
              </button>

              {/* AI summary (past workouts only) */}
              {!isActive && (
                <div className="mt-4">
                  {workout.aiSummary ? (
                    <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3">
                      <div className="text-xs uppercase tracking-[0.06em] text-muted">
                        Coach summary
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-fg">
                        {workout.aiSummary}
                      </p>
                      <button
                        onClick={onSummarize}
                        disabled={aiBusy}
                        className="mt-2 text-[11px] text-subtle hover:text-fg"
                      >
                        {aiBusy ? "Regenerating…" : "Regenerate"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onSummarize}
                      disabled={aiBusy}
                      className={`flex w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-2.5 text-sm transition ${
                        aiBusy ? "text-subtle" : "text-accent-fg hover:border-border-strong"
                      }`}
                    >
                      {aiBusy ? "Summarizing…" : "Summarize with AI"}
                    </button>
                  )}
                  {aiError && (
                    <div className="mt-2 px-3.5 text-[11px] text-muted">
                      {aiError}
                    </div>
                  )}
                </div>
              )}

              {/* Action footer */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
                {!isActive && (
                  <button
                    onClick={onRepeat}
                    className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-fg hover:border-border-strong"
                  >
                    Repeat workout
                  </button>
                )}
                {isActive ? (
                  <button
                    onClick={onDiscard}
                    className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-subtle hover:border-border-strong hover:text-fg"
                  >
                    Discard workout
                  </button>
                ) : (
                  <button
                    onClick={onDelete}
                    className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-subtle hover:border-border-strong hover:text-fg"
                  >
                    Delete workout
                  </button>
                )}
              </div>
            </div>

            {/* Rest timer */}
            {restEndsAt !== null && (
              <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-3.5 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="font-mono text-base text-fg">
                    Rest {formatRestTime(restRemaining)}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() =>
                        setRestEndsAt((prev) => (prev ? prev + 30_000 : null))
                      }
                      className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-fg"
                    >
                      +30s
                    </button>
                    <button
                      onClick={() => setRestEndsAt(null)}
                      className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:text-fg"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {pickerOpenWorkoutId !== null && (
        <ExercisePickerSheet
          workoutId={pickerOpenWorkoutId}
          onClose={() => setPickerOpenWorkoutId(null)}
        />
      )}
      {historyTarget !== null && (
        <ExerciseHistorySheet
          exerciseId={historyTarget.id}
          exerciseName={historyTarget.name}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  );
}

/* -------------------- Exercise block (inside workout) -------------------- */

function ExerciseBlock({
  exercise, exerciseIndex, workoutId, previousSets, priorBestE1RM, onToggleSet, onOpenHistory,
}: {
  exercise: WorkoutExercise;
  exerciseIndex: number;
  workoutId: number;
  previousSets: WorkoutSet[];
  priorBestE1RM: number;
  onToggleSet: (exIdx: number, setIdx: number, set: WorkoutSet) => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="mt-4 rounded-[16px] border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <button
          onClick={onOpenHistory}
          className="min-w-0 flex-1 truncate text-left text-base font-medium text-accent-fg hover:underline"
        >
          {exercise.exerciseName}
        </button>
        <button
          onClick={() => {
            if (confirm(`Remove "${exercise.exerciseName}" from this workout?`))
              removeExerciseFromWorkout(workoutId, exerciseIndex);
          }}
          aria-label="Remove exercise"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
        >
          <XIcon />
        </button>
      </div>

      {/* Target prescription + form notes (from a template) */}
      {(formatTarget(exercise) || exercise.notes) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border px-3.5 py-1.5">
          {formatTarget(exercise) && (
            <span className="font-mono text-[11px] text-accent-fg">
              Target {formatTarget(exercise)}
            </span>
          )}
          {exercise.notes && (
            <span className="text-[11px] text-muted">{exercise.notes}</span>
          )}
        </div>
      )}

      {/* Sets table header */}
      <div className="grid grid-cols-[28px_60px_1fr_1fr_50px_36px] items-center gap-1 border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-muted">
        <div>Set</div>
        <div>Prev</div>
        <div>Reps</div>
        <div>Lb</div>
        <div>RPE</div>
        <div />
      </div>

      {exercise.sets.map((set, setIdx) => (
        <SetRow
          key={setIdx}
          set={set}
          setIndex={setIdx}
          previous={previousSets[setIdx]}
          isPR={priorBestE1RM > 0 && e1RM(set) > priorBestE1RM}
          onChange={(patch) => updateSet(workoutId, exerciseIndex, setIdx, patch)}
          onDelete={() => removeSet(workoutId, exerciseIndex, setIdx)}
          onToggle={() => onToggleSet(exerciseIndex, setIdx, set)}
        />
      ))}

      <button
        onClick={() => addSet(workoutId, exerciseIndex)}
        className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2 text-sm text-accent-fg hover:bg-surface-2"
      >
        <PlusInCircle /> Add set
      </button>
    </div>
  );
}

/* -------------------- Single set row -------------------- */

function SetRow({
  set, setIndex, previous, isPR, onChange, onDelete, onToggle,
}: {
  set: WorkoutSet;
  setIndex: number;
  previous: WorkoutSet | undefined;
  isPR: boolean;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const completed = isSetCompleted(set);
  const prevDisplay = previous
    ? `${previous.reps}×${Math.round(previous.weight)}`
    : "—";

  return (
    <div
      className={`grid grid-cols-[28px_60px_1fr_1fr_50px_36px] items-center gap-1 border-b border-border px-3 py-1.5 last:border-b-0 ${
        completed ? "bg-accent-soft/40" : ""
      }`}
    >
      {isPR && completed && (
        <div className="absolute -mt-3 ml-1 rounded-[4px] bg-accent px-1 text-[8px] font-bold uppercase tracking-wider text-[#0a160d]">
          PR
        </div>
      )}
      <div className="font-mono text-sm text-muted">{setIndex + 1}</div>
      <div className="font-mono text-[11px] text-subtle">{prevDisplay}</div>
      <NumInput
        value={set.reps}
        onChange={(n) => onChange({ reps: n })}
        placeholder="—"
      />
      <NumInput
        value={set.weight}
        onChange={(n) => onChange({ weight: n })}
        placeholder="—"
      />
      <NumInput
        value={set.rpe}
        onChange={(n) => onChange({ rpe: n })}
        max={10}
        placeholder="—"
        small
      />
      <div className="flex items-center justify-center gap-0.5">
        <button
          onClick={onToggle}
          aria-label={completed ? "Undo set" : "Complete set"}
          className={`grid h-6 w-6 place-items-center rounded-[6px] border-[1.5px] transition ${
            completed ? "border-accent bg-accent" : "border-border-strong"
          }`}
        >
          {completed && <CheckIcon />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete set ${setIndex + 1}?`)) onDelete();
          }}
          aria-label="Delete set"
          className="hidden h-6 w-6 place-items-center text-[9px] text-subtle hover:text-fg"
        >
          <XIcon />
        </button>
      </div>
    </div>
  );
}

function NumInput({
  value, onChange, placeholder, small, max,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  small?: boolean;
  max?: number;
}) {
  // Edit as string so user can clear / type without 0 fighting them.
  const [draft, setDraft] = useState<string>(
    value === undefined || value === 0 ? "" : String(value),
  );
  useEffect(() => {
    setDraft(value === undefined || value === 0 ? "" : String(value));
  }, [value]);

  const commit = (v: string) => {
    if (v.trim() === "") {
      onChange(undefined);
      return;
    }
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n >= 0 && (max === undefined || n <= max)) {
      onChange(n);
    }
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
      placeholder={placeholder}
      className={`min-w-0 rounded-[6px] border border-border bg-bg px-1.5 py-1 text-center font-mono outline-none focus:border-border-strong placeholder:text-subtle ${
        small ? "text-xs" : "text-sm"
      }`}
    />
  );
}

const PlusInCircle = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
    <path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
