import { useMemo } from "react";
import type { Habit, HabitEntry } from "../db/types";
import { isScheduledOn, progressOf, startOfDay } from "../lib/habits";

// Days before the habit existed are rendered as rest cells (transparent +
// border), not as "kept" cells — mainly so brand-new avoid habits don't paint
// the entire 30/84-day window green.

interface Props {
  habit: Habit;
  entries: HabitEntry[];
  days: number;
  cols: number;
  cell: number;
  gap?: number;
}

// Shared heatmap for the habit card (30 days, 15 cols, 9px) and the detail
// screen (84 days, 12 cols, 11px). Cells fill left-to-right, top-to-bottom
// with the oldest day first so today lands in the bottom-right.
export default function HabitHeatmap({
  habit,
  entries,
  days,
  cols,
  cell,
  gap = 3,
}: Props) {
  const today = startOfDay();

  const byDay = useMemo(() => {
    const m = new Map<number, HabitEntry>();
    for (const e of entries) m.set(startOfDay(e.date), e);
    return m;
  }, [entries]);

  const habitStart = startOfDay(habit.createdAt);

  const cells = useMemo(() => {
    const arr: {
      day: number;
      scheduled: boolean;
      progress: number;
      isToday: boolean;
    }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = today - i * 86_400_000;
      // Pre-existence days render as rest cells regardless of habit kind.
      const scheduled = day >= habitStart && isScheduledOn(habit, day);
      const entry = byDay.get(day);
      const progress = scheduled ? progressOf(habit, entry) : 0;
      arr.push({ day, scheduled, progress, isToday: day === today });
    }
    return arr;
  }, [days, today, byDay, habit, habitStart]);

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gap: `${gap}px`,
      }}
    >
      {cells.map((c, i) => {
        const bg = c.scheduled
          ? c.progress <= 0
            ? "var(--color-surface-2)"
            : `color-mix(in oklab, var(--color-accent) ${Math.round(35 + c.progress * 65)}%, transparent)`
          : "transparent";
        const style: React.CSSProperties = {
          width: cell,
          height: cell,
          background: bg,
          boxShadow: c.isToday
            ? "0 0 0 1.5px var(--color-accent-soft), 0 0 0 2.5px var(--color-bg)"
            : c.scheduled
              ? "none"
              : "inset 0 0 0 1px var(--color-border)",
        };
        return <div key={i} className="rounded-[2px]" style={style} />;
      })}
    </div>
  );
}
