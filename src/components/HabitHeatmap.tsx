import { useMemo } from "react";
import type { Habit, HabitEntry } from "../db/types";
import { isScheduledOn, progressOf, startOfDay } from "../lib/habits";

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

  const cells = useMemo(() => {
    const arr: {
      day: number;
      scheduled: boolean;
      progress: number;
      isToday: boolean;
    }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = today - i * 86_400_000;
      const scheduled = isScheduledOn(habit, day);
      const entry = byDay.get(day);
      const progress = progressOf(habit, entry);
      arr.push({ day, scheduled, progress, isToday: day === today });
    }
    return arr;
  }, [days, today, byDay, habit]);

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
