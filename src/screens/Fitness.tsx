import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import WorkoutCalendar from "../components/WorkoutCalendar";
import { db } from "../db";
import type {
  CardioSession,
  Exercise,
  Workout,
} from "../db/types";
import {
  cloneWorkout,
  countPRsInWorkout,
  ensureStarterLibrary,
  formatDuration,
  runTemplate,
  startWorkout,
  totalReps,
  totalVolume,
} from "../lib/fitness";
import {
  CARDIO_LABELS,
  CARDIO_WEEKLY_TARGETS,
  countSessionsThisWeek,
  deleteCardioSession,
} from "../lib/cardio";
import WorkoutSheet from "../components/WorkoutSheet";
import WorkoutSession from "../components/WorkoutSession";
import ExportSheet from "../components/ExportSheet";
import StartDial from "../components/StartDial";
import FatigueCard from "../components/FatigueCard";
import CardioCalendar from "../components/CardioCalendar";
import ExercisesScreen from "./ExercisesScreen";
import { computeFatigue } from "../lib/fatigue";
import { exportFitnessText } from "../lib/exports";
import {
  ensureUserProgramInstalled,
  startOfWeekMon,
  workoutsThisWeek,
  type LiftDay,
} from "../lib/userProgram";

export default function Fitness() {
  useEffect(() => {
    ensureStarterLibrary().catch(console.error);
    ensureUserProgramInstalled().catch(console.error);
  }, []);

  const allWorkouts =
    useLiveQuery(() => db.workouts.orderBy("date").reverse().toArray()) ?? [];
  const active = allWorkouts.find((w) => w.completedAt === undefined) ?? null;
  const completed = useMemo(
    () => allWorkouts.filter((w) => w.completedAt !== undefined),
    [allWorkouts],
  );

  // Look up exercise library once for muscle-group tags on history rows.
  const exercises = useLiveQuery(() => db.exercises.toArray()) ?? [];
  const exerciseById = useMemo(() => {
    const m = new Map<number, Exercise>();
    for (const e of exercises) if (e.id !== undefined) m.set(e.id, e);
    return m;
  }, [exercises]);

  const [openWorkoutId, setOpenWorkoutId] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  // Collapsible sections — Recent + both cardio blocks default closed to
  // keep the top of the screen focused on today.
  const [cardioLogOpen, setCardioLogOpen] = useState(false);
  const [cardioCalendarOpen, setCardioCalendarOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [exercisesOpen, setExercisesOpen] = useState(false);

  const cardioSessions =
    useLiveQuery(() =>
      db.cardio_sessions.orderBy("date").reverse().toArray(),
    ) ?? [];

  // Tap Start on the dial: resume active if any; else run the matching PPLUL
  // template if one is installed; else fall back to an empty workout named
  // after the lift (rest days log a blank workout).
  const onStartFromDial = async (lift: LiftDay | null) => {
    if (active) {
      setOpenWorkoutId(active.id!);
      return;
    }
    try {
      if (lift) {
        const template = await db.workout_templates
          .where("name")
          .equals(lift.templateName)
          .first();
        if (template) {
          const id = await runTemplate(template.id!);
          setOpenWorkoutId(id);
          return;
        }
      }
      const id = await startWorkout(lift ? lift.name : "Workout");
      setOpenWorkoutId(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const weeklyLiftProgress =
    workoutsThisWeek(allWorkouts) / 5;
  const weeklyCardioCount = cardioSessions.filter(
    (c) => c.date >= startOfWeekMon(),
  ).length;

  const fatigue = useMemo(
    () => computeFatigue(completed, exerciseById),
    [completed, exerciseById],
  );

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              Fitness
            </h1>
            <button
              onClick={() => setExportOpen(true)}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
            >
              Export
            </button>
          </div>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {completed.length}{" "}
            {completed.length === 1 ? "workout" : "workouts"}
          </div>
        </header>

        {/* Heatmap */}
        <div className="mb-3">
          <WorkoutCalendar
            workouts={completed}
            cardioSessions={cardioSessions}
            onOpenWorkout={(id) => setOpenWorkoutId(id)}
          />
        </div>

        <StartDial
          hasActiveWorkout={!!active}
          weeklyLiftProgress={weeklyLiftProgress}
          weeklyCardioCount={weeklyCardioCount}
          onStartWorkout={onStartFromDial}
        />

        <FatigueCard fatigue={fatigue} />

        {/* Cardio — weekly tile always visible, log + calendar collapse. */}
        <div className="mb-[22px]">
          <div className="mx-1.5 mb-2.5 flex items-baseline justify-between">
            <h3 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Cardio
            </h3>
            {cardioSessions.length > 0 && (
              <span className="font-mono text-xs tracking-[0.02em] text-subtle">
                {cardioSessions.length}
              </span>
            )}
          </div>
          <CardioWeeklyTile sessions={cardioSessions} />
          <div className="mt-2 space-y-2">
            <CollapsibleHeader
              label="Recent sessions"
              meta={
                cardioSessions.length > 0
                  ? `${cardioSessions.length}`
                  : "none"
              }
              open={cardioLogOpen}
              onToggle={() => setCardioLogOpen((v) => !v)}
            />
            {cardioLogOpen && (
              <Card>
                {cardioSessions.length === 0 ? (
                  <div className="px-3.5 py-3 text-sm text-muted">
                    No cardio logged. Aim for 2× Zone 2 and 1× HIIT per week.
                  </div>
                ) : (
                  cardioSessions.map((c) => (
                    <CardioRow key={c.id} session={c} />
                  ))
                )}
              </Card>
            )}
            <CollapsibleHeader
              label="Cardio calendar"
              meta="month"
              open={cardioCalendarOpen}
              onToggle={() => setCardioCalendarOpen((v) => !v)}
            />
            {cardioCalendarOpen && (
              <CardioCalendar sessions={cardioSessions} />
            )}
          </div>
        </div>

        {/* Exercises link — opens the full-screen per-lift stats view. */}
        <button
          onClick={() => setExercisesOpen(true)}
          className="mb-[22px] flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.995]"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-tight text-fg">Exercises</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">
              maxes · weight trends · per-lift history
            </div>
          </div>
          <span className="text-subtle">›</span>
        </button>

        {/* Recent — collapsible so it doesn't dominate the screen. */}
        <div className="mb-[22px]">
          <div className="mx-1.5 mb-2.5 flex items-baseline justify-between">
            <h3 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Recent
            </h3>
            {completed.length > 0 && (
              <span className="font-mono text-xs tracking-[0.02em] text-subtle">
                {completed.length}
              </span>
            )}
          </div>
          {completed.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              No completed workouts yet. Tap Start on the dial above to begin.
            </div>
          ) : (
            <>
              <CollapsibleHeader
                label="Workout history"
                meta={`${completed.length}`}
                open={recentOpen}
                onToggle={() => setRecentOpen((v) => !v)}
              />
              {recentOpen && (
                <Card>
                  {completed.map((w) => (
                    <WorkoutRow
                      key={w.id}
                      workout={w}
                      allWorkouts={completed}
                      exerciseById={exerciseById}
                      onClick={() => setOpenWorkoutId(w.id!)}
                      onClone={async () => {
                        const id = await cloneWorkout(w.id!);
                        setOpenWorkoutId(id);
                      }}
                    />
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {openWorkoutId !== null && (() => {
        // Active workouts (still in progress) go to the new live session
        // screen; completed workouts open in the read-only-ish WorkoutSheet
        // so we can still review past days from the calendar / history.
        const w = allWorkouts.find((x) => x.id === openWorkoutId);
        if (w && w.completedAt === undefined) {
          return (
            <WorkoutSession
              workoutId={openWorkoutId}
              onClose={() => setOpenWorkoutId(null)}
            />
          );
        }
        return (
          <WorkoutSheet
            workoutId={openWorkoutId}
            onClose={() => setOpenWorkoutId(null)}
            onSwitchWorkout={(newId) => setOpenWorkoutId(newId)}
          />
        );
      })()}

      {exercisesOpen && (
        <ExercisesScreen onClose={() => setExercisesOpen(false)} />
      )}

      {exportOpen && (
        <ExportSheet
          title="Workouts"
          generate={exportFitnessText}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

function CardioWeeklyTile({ sessions }: { sessions: CardioSession[] }) {
  const counts = useMemo(() => countSessionsThisWeek(sessions), [sessions]);
  const lissTarget = CARDIO_WEEKLY_TARGETS.liss;
  const hiitTarget = CARDIO_WEEKLY_TARGETS.hiit;
  const lissHit = counts.liss >= lissTarget;
  const hiitHit = counts.hiit >= hiitTarget;

  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      <WeeklyChip
        label="Zone 2 / LISS"
        value={counts.liss}
        target={lissTarget}
        hit={lissHit}
      />
      <WeeklyChip
        label="HIIT"
        value={counts.hiit}
        target={hiitTarget}
        hit={hiitHit}
      />
    </div>
  );
}

function WeeklyChip({
  label,
  value,
  target,
  hit,
}: {
  label: string;
  value: number;
  target: number;
  hit: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-muted">
        <span>{label}</span>
        {hit && <span className="text-accent-fg">✓</span>}
      </div>
      <div className="mt-0.5 font-mono text-sm">
        <span className={hit ? "text-accent-fg" : "text-fg"}>{value}</span>
        <span className="text-subtle"> / {target}</span>
        <span className="ml-1 text-[10px] text-subtle">this week</span>
      </div>
    </div>
  );
}

function CardioRow({ session }: { session: CardioSession }) {
  const dateStr = new Date(session.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const onDelete = async () => {
    if (confirm("Delete this cardio session?")) {
      await deleteCardioSession(session.id!);
    }
  };
  return (
    <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium ${
              session.kind === "hiit"
                ? "bg-accent-soft text-accent-fg"
                : "border border-border bg-bg text-muted"
            }`}
          >
            {CARDIO_LABELS[session.kind]}
          </span>
          {session.modality && (
            <span className="truncate text-sm text-fg">
              {session.modality}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {dateStr}
          {session.notes ? ` · ${session.notes}` : ""}
        </div>
      </div>
      <div className="font-mono text-sm text-fg">
        {session.durationMin}
        <span className="text-xs text-muted"> min</span>
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete cardio session"
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
      >
        <XIcon />
      </button>
    </div>
  );
}


// Small header used for the collapsible cardio + recent sub-sections.
// Rounded pill row with a chevron that flips when open.
function CollapsibleHeader({
  label,
  meta,
  open,
  onToggle,
}: {
  label: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-left hover:border-border-strong"
    >
      <span className="text-sm text-fg">{label}</span>
      {meta && (
        <span className="ml-auto font-mono text-[11px] text-subtle">
          {meta}
        </span>
      )}
      <span
        className={`text-subtle transition-transform ${
          open ? "rotate-90" : ""
        }`}
      >
        ›
      </span>
    </button>
  );
}

const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* -------------------- Workout row -------------------- */

function WorkoutRow({
  workout, allWorkouts, exerciseById, onClick, onClone,
}: {
  workout: Workout;
  allWorkouts: Workout[];
  exerciseById: Map<number, Exercise>;
  onClick: () => void;
  onClone: () => void;
}) {
  const date = new Date(workout.date);
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const exerciseCount = workout.exercises.length;
  const volume = totalVolume(workout);
  const reps = totalReps(workout);
  const prCount = countPRsInWorkout(workout, allWorkouts);

  const muscleGroups = useMemo(() => {
    const set = new Set<string>();
    for (const ex of workout.exercises) {
      if (ex.exerciseId !== undefined) {
        const lib = exerciseById.get(ex.exerciseId);
        if (lib) {
          for (const g of lib.muscleGroups) set.add(g);
        }
      }
    }
    return Array.from(set);
  }, [workout, exerciseById]);

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-base leading-tight">{workout.name}</div>
          {prCount > 0 && (
            <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">
              {prCount} PR{prCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted">
          {dateStr} · {exerciseCount}{" "}
          {exerciseCount === 1 ? "exercise" : "exercises"}
          {workout.durationSec ? ` · ${formatDuration(workout.durationSec)}` : ""}
        </div>
        {muscleGroups.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {muscleGroups.slice(0, 4).map((g) => (
              <span
                key={g}
                className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="text-right">
          <div className="font-mono text-sm text-fg">
            {Math.round(volume).toLocaleString()}
            <span className="text-xs text-muted"> lb</span>
          </div>
          <div className="font-mono text-xs text-muted">{reps} reps</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClone();
          }}
          className="rounded-[6px] border border-border bg-bg px-1.5 py-0.5 text-[10px] text-subtle hover:border-border-strong hover:text-fg"
          aria-label="Repeat this workout"
        >
          Repeat
        </button>
      </div>
    </div>
  );
}
