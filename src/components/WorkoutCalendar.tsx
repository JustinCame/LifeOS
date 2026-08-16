import { useEffect, useMemo, useState } from "react";
import type { CardioSession, Workout } from "../db/types";
import { completedSetCount, formatDuration, totalVolume, countPRsInWorkout } from "../lib/fitness";

interface Props {
  workouts: Workout[];        // completed workouts only
  cardioSessions: CardioSession[];
  onOpenWorkout?: (id: number) => void;
}

const KIND_LETTER: Record<string, string> = {
  push: "Ph",
  pull: "Pl",
  legs: "Lg",
  upper: "Up",
  lower: "Lo",
};

// Match on the workout name prefix. PPLUL templates are named "Push", "Pull",
// "Legs", "Upper", "Lower"; anything else falls back to a blank tag.
function workoutKind(name: string): string | null {
  const n = name.toLowerCase();
  if (n.startsWith("push")) return "push";
  if (n.startsWith("pull")) return "pull";
  if (n.startsWith("leg")) return "legs";
  if (n.startsWith("upper")) return "upper";
  if (n.startsWith("lower")) return "lower";
  return null;
}

function startOfDay(d: Date | number): number {
  const dt = typeof d === "number" ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

// Month grid where a day lights up if a workout happened, tag letter in the
// corner, tap for details, cardio-only days get a faint accent wash.
export default function WorkoutCalendar({
  workouts,
  cardioSessions,
  onOpenWorkout,
}: Props) {
  const today0 = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayMs = today0.getTime();

  const [anchor, setAnchor] = useState(
    () => new Date(today0.getFullYear(), today0.getMonth(), 1).getTime(),
  );
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [anchor]);

  const anchorDate = new Date(anchor);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const monthName = anchorDate.toLocaleDateString(undefined, { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const workoutByDay = useMemo(() => {
    const m = new Map<number, Workout>();
    for (const w of workouts) {
      if (w.completedAt === undefined) continue;
      m.set(startOfDay(w.date), w);
    }
    return m;
  }, [workouts]);

  const cardioByDay = useMemo(() => {
    const m = new Map<number, CardioSession>();
    for (const c of cardioSessions) m.set(startOfDay(c.date), c);
    return m;
  }, [cardioSessions]);

  const grid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const cells: (
      | {
          day: number;
          date: number;
          workout: Workout | undefined;
          cardio: CardioSession | undefined;
          setCount: number;
          isToday: boolean;
          isFuture: boolean;
        }
      | null
    )[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d).getTime();
      const workout = workoutByDay.get(date);
      const setCount = workout ? completedSetCount(workout) : 0;
      cells.push({
        day: d,
        date,
        workout,
        cardio: cardioByDay.get(date),
        setCount,
        isToday: date === todayMs,
        isFuture: date > todayMs,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, daysInMonth, workoutByDay, cardioByDay, todayMs]);

  const monthCount = useMemo(
    () =>
      Array.from(workoutByDay.values()).filter((w) => {
        const d = new Date(w.date);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length,
    [workoutByDay, year, month],
  );

  const atCurrent =
    year === today0.getFullYear() && month === today0.getMonth();

  const selectedCell = selected !== null
    ? grid.find((c) => c && c.date === selected) ?? null
    : null;
  // Detail-strip data for the selected cell.
  const selVolume = selectedCell?.workout
    ? Math.round(totalVolume(selectedCell.workout))
    : 0;
  const selPRs = selectedCell?.workout
    ? countPRsInWorkout(selectedCell.workout, workouts)
    : 0;

  return (
    <div className="mb-3 rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-fg">{monthName}</span>
          <span className="font-mono text-[11px] text-subtle">
            {monthCount} {monthCount === 1 ? "workout" : "workouts"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() =>
              setAnchor(new Date(year, month - 1, 1).getTime())
            }
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg"
          >
            ‹
          </button>
          <button
            aria-label="Next month"
            disabled={atCurrent}
            onClick={() =>
              setAnchor(new Date(year, month + 1, 1).getTime())
            }
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-[3px] text-center text-[9px] uppercase tracking-[0.06em] text-subtle">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const lit = !!cell.workout;
          const cardioOnly = !lit && !!cell.cardio;
          const isSel = selected === cell.date;
          const kind = cell.workout ? workoutKind(cell.workout.name) : null;
          const bg = lit
            ? `color-mix(in oklab, var(--color-accent) ${Math.min(100, 45 + cell.setCount * 2.6)}%, var(--color-surface-2))`
            : cardioOnly
              ? "color-mix(in oklab, var(--color-accent) 14%, var(--color-surface-2))"
              : cell.isFuture
                ? "transparent"
                : "var(--color-surface-2)";
          const textClass = lit
            ? "font-medium text-[#0a160d]"
            : cardioOnly
              ? "text-accent-fg"
              : cell.isFuture
                ? "text-subtle/40"
                : "text-subtle";
          return (
            <button
              key={i}
              onClick={() => setSelected(isSel ? null : cell.date)}
              className={`relative grid aspect-square place-items-center rounded-[6px] font-mono text-[10px] transition ${textClass}`}
              style={{
                background: bg,
                boxShadow: isSel
                  ? "0 0 0 1.5px var(--color-fg)"
                  : cell.isToday
                    ? "0 0 0 1.5px var(--color-border-strong)"
                    : "none",
              }}
            >
              {cell.day}
              {lit && kind && (
                <span className="absolute bottom-[1px] right-[2px] whitespace-nowrap text-[7px] leading-none opacity-70">
                  {KIND_LETTER[kind]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <button
          onClick={() => {
            if (selectedCell.workout && onOpenWorkout) {
              onOpenWorkout(selectedCell.workout.id!);
            }
          }}
          disabled={!selectedCell.workout}
          className="mt-2.5 flex w-full items-center gap-3 border-t border-border pt-2.5 text-left disabled:cursor-default"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-fg">
              {selectedCell.workout
                ? selectedCell.workout.name
                : selectedCell.cardio
                  ? selectedCell.cardio.modality || (selectedCell.cardio.kind === "hiit" ? "HIIT" : "Zone 2")
                  : selectedCell.isFuture
                    ? "Scheduled"
                    : "Rest day"}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">
              {new Date(selectedCell.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {selectedCell.workout && (
                <>
                  {" · "}
                  {selectedCell.setCount} sets
                  {" · "}
                  {selVolume.toLocaleString()} lb
                  {selectedCell.workout.durationSec
                    ? ` · ${formatDuration(selectedCell.workout.durationSec)}`
                    : ""}
                </>
              )}
              {!selectedCell.workout && selectedCell.cardio && (
                <>
                  {" · "}
                  {selectedCell.cardio.durationMin} min
                  {" · "}
                  {selectedCell.cardio.kind === "hiit" ? "HIIT" : "Zone 2"}
                </>
              )}
            </div>
          </div>
          {selPRs > 0 && (
            <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">
              {selPRs} PR{selPRs > 1 ? "s" : ""}
            </span>
          )}
          {selectedCell.workout && onOpenWorkout && (
            <span className="text-subtle">›</span>
          )}
        </button>
      )}
    </div>
  );
}
