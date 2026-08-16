import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Exercise } from "../db/types";
import {
  exerciseSessions,
  type ExerciseSession,
} from "../lib/fitness";

interface Props {
  onClose: () => void;
}

// Filter categories — Arms and Legs collapse a few groups together per spec.
const FILTERS: { key: string; label: string; groups: string[] }[] = [
  { key: "all", label: "All", groups: [] },
  { key: "chest", label: "Chest", groups: ["chest"] },
  { key: "back", label: "Back", groups: ["back", "traps", "lowerback"] },
  { key: "shoulders", label: "Shoulders", groups: ["shoulders"] },
  { key: "arms", label: "Arms", groups: ["biceps", "triceps", "forearms"] },
  { key: "legs", label: "Legs", groups: ["quads", "hamstrings", "glutes", "calves"] },
  { key: "core", label: "Core", groups: ["core", "obliques"] },
];

interface RowData {
  exercise: Exercise;
  sessions: ExerciseSession[]; // newest first
  latestE1RM: number;
  firstE1RM: number;
  lastDate: number;
}

export default function ExercisesScreen({ onClose }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 260);
  };

  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const exercises =
    useLiveQuery(() => db.exercises.toArray()) ?? [];
  const workouts =
    useLiveQuery(() =>
      db.workouts.filter((w) => w.completedAt !== undefined).toArray(),
    ) ?? [];

  const rows = useMemo<RowData[]>(() => {
    const out: RowData[] = [];
    for (const ex of exercises) {
      if (ex.id === undefined) continue;
      const sessions = exerciseSessions(workouts, ex.id);
      if (sessions.length === 0) continue;
      const latest = sessions[0].topE1RM;
      const first = sessions[sessions.length - 1].topE1RM;
      out.push({
        exercise: ex,
        sessions,
        latestE1RM: latest,
        firstE1RM: first,
        lastDate: sessions[0].date,
      });
    }
    return out;
  }, [exercises, workouts]);

  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const filtered = useMemo(() => {
    if (activeFilter.groups.length === 0) return rows;
    return rows.filter((r) =>
      r.exercise.muscleGroups.some((g) => activeFilter.groups.includes(g)),
    );
  }, [rows, activeFilter]);

  // Sort: highest e1RM first, then most recent.
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (b.latestE1RM !== a.latestE1RM) return b.latestE1RM - a.latestE1RM;
        return b.lastDate - a.lastDate;
      }),
    [filtered],
  );

  const detailRow = detailId !== null ? rows.find((r) => r.exercise.id === detailId) ?? null : null;

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${
        shown ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
    >
      <div className="flex-1 overflow-y-auto px-[18px] pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={close}
            className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg"
          >
            <ChevronLeft />
            Fitness
          </button>
        </div>

        <header className="px-1.5 pb-3 pt-1">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Exercises
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {sorted.length} {sorted.length === 1 ? "lift" : "lifts"} · maxes &
            trends from workout history
          </div>
        </header>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.key
                  ? "bg-accent text-[#0a160d]"
                  : "border border-border bg-surface text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No {activeFilter.key === "all" ? "" : `${activeFilter.label} `}
            lifts logged yet.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => (
              <ExerciseRow
                key={r.exercise.id}
                row={r}
                onOpen={() => setDetailId(r.exercise.id!)}
              />
            ))}
          </div>
        )}
      </div>

      {detailRow && (
        <ExerciseDetail
          row={detailRow}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

/* -------------------- List row -------------------- */

function ExerciseRow({ row, onOpen }: { row: RowData; onOpen: () => void }) {
  const delta = Math.round(row.latestE1RM - row.firstE1RM);
  const daysAgo = Math.floor(
    (Date.now() - row.lastDate) / 86_400_000,
  );
  const lastLabel =
    daysAgo <= 0
      ? "today"
      : daysAgo === 1
        ? "1d ago"
        : daysAgo < 30
          ? `${daysAgo}d ago`
          : new Date(row.lastDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2.5 text-left hover:border-border-strong active:scale-[0.995]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight text-fg">
          {row.exercise.name}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {row.exercise.equipment} · {lastLabel}
        </div>
      </div>
      <Sparkline
        values={row.sessions.map((s) => s.topE1RM).reverse()}
        width={56}
        height={20}
      />
      <div className="flex flex-col items-end">
        <span className="font-mono text-sm text-fg">
          {Math.round(row.latestE1RM)}
        </span>
        <span
          className={`font-mono text-[10px] ${
            delta > 0
              ? "text-accent-fg"
              : delta < 0
                ? "text-subtle"
                : "text-subtle"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      </div>
    </button>
  );
}

/* -------------------- Detail push -------------------- */

function ExerciseDetail({
  row,
  onClose,
}: {
  row: RowData;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 260);
  };

  const { exercise, sessions, latestE1RM, firstE1RM } = row;

  // Maxes tile inputs.
  const heaviest = useMemo(() => {
    let best: { weight: number; reps: number } | null = null;
    for (const s of sessions) {
      for (const set of s.sets) {
        if (!best || set.weight > best.weight) {
          best = { weight: set.weight, reps: set.reps };
        }
      }
    }
    return best;
  }, [sessions]);
  const mostReps = useMemo(() => {
    let best: { reps: number; weight: number } | null = null;
    for (const s of sessions) {
      for (const set of s.sets) {
        if (!best || set.reps > best.reps) {
          best = { reps: set.reps, weight: set.weight };
        }
      }
    }
    return best;
  }, [sessions]);
  const totalVol = useMemo(
    () =>
      sessions.reduce(
        (t, s) => t + s.sets.reduce((x, set) => x + set.weight * set.reps, 0),
        0,
      ),
    [sessions],
  );

  const delta = Math.round(latestE1RM - firstE1RM);

  // Build PR set — session-by-session running max of topE1RM.
  const prBySession = useMemo(() => {
    const chronological = [...sessions].reverse();
    let best = 0;
    const isPR = new Set<number>();
    for (const s of chronological) {
      if (s.topE1RM > best) {
        best = s.topE1RM;
        isPR.add(s.workoutId);
      }
    }
    return isPR;
  }, [sessions]);

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${
        shown ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
    >
      <div className="flex-1 overflow-y-auto px-[18px] pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={close}
            className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg"
          >
            <ChevronLeft />
            Exercises
          </button>
        </div>

        <header className="px-1.5 pb-3 pt-1">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            {exercise.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            <span>{exercise.equipment}</span>
            {exercise.muscleGroups.map((g) => (
              <span
                key={g}
                className="rounded-[5px] border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        </header>

        {/* Maxes */}
        <div className="mb-3 grid grid-cols-3 overflow-hidden rounded-[16px] border border-border bg-surface">
          <MaxTile
            label="Est 1RM"
            value={`${Math.round(latestE1RM)}`}
            sub={
              delta === 0
                ? "no gain yet"
                : `${delta > 0 ? "+" : ""}${delta} all-time`
            }
            accent={delta > 0}
          />
          <MaxTile
            label="Heaviest"
            value={heaviest ? `${heaviest.weight}` : "—"}
            sub={heaviest ? `× ${heaviest.reps} reps` : ""}
          />
          <MaxTile
            label="Most reps"
            value={mostReps ? `${mostReps.reps}` : "—"}
            sub={
              mostReps
                ? `${Math.round(totalVol).toLocaleString()} lb total`
                : ""
            }
          />
        </div>

        {/* Trend */}
        <div className="mb-3 rounded-[16px] border border-border bg-surface px-3.5 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-[0.06em] text-muted">
              Est 1RM trend
            </span>
            <span className="font-mono text-[11px] text-subtle">
              {sessions.length} sessions
            </span>
          </div>
          <TrendChart sessions={sessions} />
        </div>

        {/* History */}
        <div className="rounded-[16px] border border-border bg-surface">
          <div className="border-b border-border px-3.5 py-2 text-xs uppercase tracking-[0.06em] text-muted">
            History
          </div>
          {sessions.map((s) => (
            <div
              key={s.workoutId}
              className="border-t border-border px-3.5 py-3 first:border-t-0"
            >
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[11px] text-muted">
                  {new Date(s.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  {prBySession.has(s.workoutId) && (
                    <span className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">
                      PR
                    </span>
                  )}
                  <span className="font-mono text-sm text-fg">
                    {Math.round(s.topE1RM)}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {s.sets.map((set, i) => (
                  <span
                    key={i}
                    className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted"
                  >
                    {set.weight}×{set.reps}
                    {set.rpe !== undefined && (
                      <span className="ml-1 text-subtle">@{set.rpe}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaxTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-border px-3 py-3.5 first:border-l-0">
      <span className="text-xs uppercase tracking-[0.04em] text-muted">
        {label}
      </span>
      <span
        className={`font-mono text-[18px] tracking-[-0.01em] ${accent ? "text-accent-fg" : "text-fg"}`}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px] text-subtle">{sub}</span>
      )}
    </div>
  );
}

/* -------------------- Sparkline (list row) -------------------- */

function Sparkline({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) {
  if (values.length === 0) {
    return <div style={{ width, height }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="block flex-shrink-0">
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------- Trend chart (detail) -------------------- */

function TrendChart({ sessions }: { sessions: ExerciseSession[] }) {
  // sessions is newest first — reverse to draw left-to-right chronological.
  const points = useMemo(
    () =>
      [...sessions]
        .reverse()
        .map((s) => ({ x: s.date, y: s.topE1RM, session: s })),
    [sessions],
  );
  if (points.length === 0) return null;

  const W = 300;
  const H = 90;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const step = points.length > 1 ? (W - 6) / (points.length - 1) : 0;

  const pts = points.map((p, i) => ({
    px: 3 + i * step,
    py: H - 6 - ((p.y - min) / range) * (H - 12),
    ...p,
  }));

  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${pts[pts.length - 1].px.toFixed(1)},${H} L${pts[0].px.toFixed(1)},${H} Z`;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-24 w-full">
        <path d={area} fill="var(--color-accent-soft)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.px}
            cy={p.py}
            r="1.8"
            fill="var(--color-accent)"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>low {Math.round(min)}</span>
        <span>peak {Math.round(max)}</span>
      </div>
    </>
  );
}

/* -------------------- Icons -------------------- */

const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M9 2 4 7l5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

