import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import WorkoutCalendar from "../components/WorkoutCalendar";
import { db } from "../db";
import type {
  CardioSession,
  Exercise,
  Workout,
  WorkoutTemplate,
} from "../db/types";
import {
  cloneWorkout,
  countPRsInWorkout,
  deleteTemplate,
  ensureStarterLibrary,
  formatDuration,
  runTemplate,
  startWorkout,
  totalReps,
  totalVolume,
} from "../lib/fitness";
import { installPPLULProgram } from "../lib/pplul";
import {
  CARDIO_LABELS,
  CARDIO_WEEKLY_TARGETS,
  countSessionsThisWeek,
  deleteCardioSession,
} from "../lib/cardio";
import WorkoutSheet from "../components/WorkoutSheet";
import TemplateSheet, { type TemplateTarget } from "../components/TemplateSheet";
import CardioSheet from "../components/CardioSheet";
import ExportSheet from "../components/ExportSheet";
import { exportFitnessText } from "../lib/exports";

export default function Fitness() {
  useEffect(() => {
    ensureStarterLibrary().catch(console.error);
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
  const [templateTarget, setTemplateTarget] = useState<TemplateTarget>(null);
  const [cardioOpen, setCardioOpen] = useState(false);
  const [cardioExpanded, setCardioExpanded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const templates =
    useLiveQuery(() =>
      db.workout_templates.orderBy("createdAt").reverse().toArray(),
    ) ?? [];
  const pplulInstalled = templates.some((t) => t.name.startsWith("PPLUL"));

  const cardioSessions =
    useLiveQuery(() =>
      db.cardio_sessions.orderBy("date").reverse().toArray(),
    ) ?? [];

  const onInstallPPLUL = async () => {
    if (
      pplulInstalled &&
      !confirm(
        "Reinstall the PPLUL program? This replaces the 5 PPLUL templates with the original program definition.",
      )
    ) {
      return;
    }
    try {
      await installPPLULProgram();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const startNew = async () => {
    if (active) {
      setOpenWorkoutId(active.id!);
      return;
    }
    const id = await startWorkout();
    setOpenWorkoutId(id);
  };

  const onRunTemplate = async (templateId: number) => {
    try {
      const id = await runTemplate(templateId);
      setOpenWorkoutId(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

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

        <button
          onClick={startNew}
          className={`mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-medium active:scale-[0.99] ${
            active
              ? "border border-accent bg-accent-soft text-accent-fg"
              : "bg-accent text-[#0a160d]"
          }`}
        >
          {active ? "Resume Workout" : "+ Start a Workout"}
        </button>

        {/* Templates */}
        <Section
          title="Templates"
          meta={templates.length > 0 ? `${templates.length}` : ""}
        >
          <Card>
            {templates.length === 0 && (
              <div className="px-3.5 py-3 text-sm text-muted">
                No templates yet. Tap "+ New template" below to save a workout
                shape you can run again.
              </div>
            )}
            {templates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onRun={() => onRunTemplate(t.id!)}
                onEdit={() => setTemplateTarget(t.id!)}
                onDelete={async () => {
                  if (confirm(`Delete template "${t.name}"?`)) {
                    await deleteTemplate(t.id!);
                  }
                }}
              />
            ))}
            <button
              onClick={() => setTemplateTarget("new")}
              className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"
            >
              + New template
            </button>
            <button
              onClick={onInstallPPLUL}
              className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"
            >
              {pplulInstalled
                ? "↻ Reinstall PPLUL program"
                : "↓ Install PPLUL 5-day program"}
            </button>
          </Card>
        </Section>

        {completed.length === 0 ? (
          <div className="mt-4 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No completed workouts yet. Tap{" "}
            <span className="text-fg">+ Start a Workout</span> to begin.
          </div>
        ) : (
          <Section title="History" meta={`${completed.length}`}>
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
          </Section>
        )}

        {/* Cardio */}
        <Section
          title="Cardio"
          meta={cardioSessions.length > 0 ? `${cardioSessions.length}` : ""}
        >
          <CardioWeeklyTile sessions={cardioSessions} />
          <Card>
            {cardioSessions.length === 0 && (
              <div className="px-3.5 py-3 text-sm text-muted">
                No cardio logged. Aim for 2× Zone 2 and 1× HIIT per week.
              </div>
            )}
            {(cardioExpanded
              ? cardioSessions
              : cardioSessions.slice(0, 8)
            ).map((c) => (
              <CardioRow key={c.id} session={c} />
            ))}
            {cardioSessions.length > 8 && (
              <button
                onClick={() => setCardioExpanded((v) => !v)}
                className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2 text-xs text-subtle hover:bg-surface-2 hover:text-fg"
              >
                {cardioExpanded
                  ? "Show less"
                  : `Show all (${cardioSessions.length})`}
              </button>
            )}
            <button
              onClick={() => setCardioOpen(true)}
              className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"
            >
              + Log cardio
            </button>
          </Card>
        </Section>
      </div>

      {openWorkoutId !== null && (
        <WorkoutSheet
          workoutId={openWorkoutId}
          onClose={() => setOpenWorkoutId(null)}
          onSwitchWorkout={(newId) => setOpenWorkoutId(newId)}
        />
      )}

      {templateTarget !== null && (
        <TemplateSheet
          target={templateTarget}
          onClose={() => setTemplateTarget(null)}
        />
      )}

      {cardioOpen && (
        <CardioSheet onClose={() => setCardioOpen(false)} />
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

function TemplateRow({
  template, onRun, onEdit, onDelete,
}: {
  template: WorkoutTemplate;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 first:border-t-0">
      <button
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-base leading-tight text-fg">
          {template.name}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {template.exercises.length}{" "}
          {template.exercises.length === 1 ? "exercise" : "exercises"}
          {template.useCount > 0 && ` · used ${template.useCount}×`}
        </div>
      </button>
      <button
        onClick={onRun}
        className="rounded-[8px] bg-accent px-3 py-1.5 text-xs font-medium text-[#0a160d] active:scale-[0.98]"
      >
        Run
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete template"
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
      >
        <XIcon />
      </button>
    </div>
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
