import { useEffect, useMemo, useState } from "react";
import type { HealthLog } from "../db/types";
import { startOfDay } from "../lib/health";

// Sunday-start, like the OS calendar in the US.
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Accent shades for logged days — lighter cell = lighter weight that month.
const LOGGED_BG = [
  "color-mix(in oklab, var(--color-accent) 22%, transparent)",
  "color-mix(in oklab, var(--color-accent) 42%, transparent)",
  "color-mix(in oklab, var(--color-accent) 64%, transparent)",
  "var(--color-accent)",
];

interface Cell {
  day: number; // day-of-month (1..31)
  date: number; // ms timestamp at start of day
  weight: number | undefined;
  level: 0 | 1 | 2 | 3;
  isFuture: boolean;
  isToday: boolean;
}

export default function WeightHeatmap({ logs }: { logs: HealthLog[] }) {
  // Today, at start-of-day.
  const today0 = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayMs = today0.getTime();

  // Anchor for the displayed month (first day, 00:00 local).
  const [monthAnchor, setMonthAnchor] = useState(() =>
    new Date(today0.getFullYear(), today0.getMonth(), 1).getTime(),
  );
  const anchorDate = new Date(monthAnchor);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const monthName = anchorDate.toLocaleDateString(undefined, { month: "long" });

  // Reset the tapped-day highlight when the user changes month.
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [monthAnchor]);

  // Weight-by-day for the displayed month only.
  const monthStart = useMemo(
    () => new Date(year, month, 1).getTime(),
    [year, month],
  );
  const daysInMonth = useMemo(
    () => new Date(year, month + 1, 0).getDate(),
    [year, month],
  );
  const monthEnd = useMemo(
    () => new Date(year, month, daysInMonth).getTime(),
    [year, month, daysInMonth],
  );

  const weightByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of logs) {
      const day = startOfDay(l.date);
      if (day >= monthStart && day <= monthEnd) m.set(day, l.value);
    }
    return m;
  }, [logs, monthStart, monthEnd]);

  // All-time weight-by-day, used for the weekly average (which may straddle
  // months — e.g. tapping Sunday Mar 31 should still include Apr 1's entry).
  const weightByDayAll = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of logs) m.set(startOfDay(l.date), l.value);
    return m;
  }, [logs]);

  // Monthly average + min/max for shading scope.
  const { avg, min, max } = useMemo(() => {
    const vals = Array.from(weightByDay.values());
    if (vals.length === 0) return { avg: null as number | null, min: 0, max: 0 };
    return {
      avg: vals.reduce((s, v) => s + v, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [weightByDay]);

  const levelFor = (w: number): 0 | 1 | 2 | 3 => {
    if (max === min) return 1;
    const f = (w - min) / (max - min);
    if (f < 0.25) return 0;
    if (f < 0.5) return 1;
    if (f < 0.75) return 2;
    return 3;
  };

  // Build the grid: leading blanks → days 1..N → trailing blanks to fill row.
  const grid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sunday
    const cells: (Cell | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d).getTime();
      const weight = weightByDay.get(date);
      cells.push({
        day: d,
        date,
        weight,
        level: weight !== undefined ? levelFor(weight) : 0,
        isFuture: date > todayMs,
        isToday: date === todayMs,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
    // levelFor depends on min/max, included via weightByDay.
  }, [year, month, daysInMonth, weightByDay, todayMs, min, max]);

  // Default the readout to the most recent logged day in this month.
  const latestLoggedDay = useMemo(() => {
    let latest: number | null = null;
    for (const day of weightByDay.keys()) {
      if (latest === null || day > latest) latest = day;
    }
    return latest;
  }, [weightByDay]);

  const shownDay = selected ?? latestLoggedDay;
  const shownWeight =
    shownDay !== null ? weightByDay.get(shownDay) : undefined;

  // Sunday→Saturday week containing `shownDay` (or today if nothing logged
  // this month). Used for the weekly-average chip.
  const weekInfo = useMemo(() => {
    const anchor = shownDay ?? todayMs;
    const d = new Date(anchor);
    d.setHours(0, 0, 0, 0);
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay()); // 0 = Sunday
    const weekStart = sunday.getTime();
    const vals: number[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      const w = weightByDayAll.get(day.getTime());
      if (w !== undefined) vals.push(w);
    }
    const weekAvg =
      vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return { weekStart, weekAvg, count: vals.length };
  }, [shownDay, todayMs, weightByDayAll]);

  // Month navigation.
  const prevMonth = () =>
    setMonthAnchor(new Date(year, month - 1, 1).getTime());
  const nextMonth = () => {
    const next = new Date(year, month + 1, 1).getTime();
    if (next > new Date(today0.getFullYear(), today0.getMonth(), 1).getTime()) {
      return;
    }
    setMonthAnchor(next);
  };
  const atCurrentMonth =
    year === today0.getFullYear() && month === today0.getMonth();

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Daily weight
        </div>
        <div className="flex flex-col items-end gap-0.5 font-mono text-[11px] leading-tight tracking-[0.02em]">
          <span className="text-fg">
            {weekInfo.weekAvg !== null ? (
              <>
                {weekInfo.weekAvg.toFixed(1)}
                <span className="text-subtle"> lb · week avg</span>
              </>
            ) : (
              <span className="text-subtle">— week avg</span>
            )}
          </span>
          <span className="text-subtle">
            {avg !== null ? `${avg.toFixed(1)} lb · month avg` : "— month avg"}
          </span>
        </div>
      </div>

      {/* Month nav */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
        >
          ‹
        </button>
        <div className="text-sm font-medium text-fg">{monthName}</div>
        <button
          onClick={nextMonth}
          disabled={atCurrentMonth}
          aria-label="Next month"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-[3px]">
        {WEEKDAY_LABELS.map((d, i) => (
          <div
            key={i}
            className="text-center font-mono text-[10px] text-subtle"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (cell === null) return <div key={i} className="aspect-square" />;
          const isShown = shownDay !== null && cell.date === shownDay;
          const isLogged = cell.weight !== undefined;
          const bg = cell.isFuture
            ? "transparent"
            : isLogged
              ? LOGGED_BG[cell.level]
              : "var(--color-surface-2)";
          const dayTextDark = isLogged && cell.level === 3;
          return (
            <button
              key={i}
              disabled={cell.isFuture}
              onClick={() => setSelected(cell.date)}
              className="relative grid aspect-square place-items-center rounded-[6px]"
              style={{
                background: bg,
                opacity: cell.isFuture ? 0.3 : 1,
                boxShadow: isShown
                  ? "inset 0 0 0 1.5px var(--color-fg)"
                  : cell.isToday
                    ? "inset 0 0 0 1px var(--color-fg)"
                    : "none",
              }}
            >
              {isLogged ? (
                <>
                  {/* Day number: tiny in the top-right so the weight can be
                      the primary readout without losing which day is which. */}
                  <span
                    className={`absolute right-[3px] top-[2px] font-mono text-[8px] leading-none opacity-70 ${
                      dayTextDark ? "text-[#0a160d]" : "text-fg"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-medium leading-none ${
                      dayTextDark ? "text-[#0a160d]" : "text-fg"
                    }`}
                  >
                    {Math.round(cell.weight!)}
                  </span>
                </>
              ) : (
                <span
                  className={`font-mono text-xs ${
                    dayTextDark ? "text-[#0a160d]" : "text-fg"
                  }`}
                >
                  {cell.day}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-subtle">
        <span>Lighter</span>
        {LOGGED_BG.map((bg, lvl) => (
          <div
            key={lvl}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: bg }}
          />
        ))}
        <span>Heavier</span>
      </div>

      {/* Selected-day readout */}
      <div className="mt-2.5 border-t border-border pt-2.5">
        {shownDay === null ? (
          <div className="text-center font-mono text-[11px] text-subtle">
            Tap a day to see that day's weight
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-muted">
                {new Date(shownDay).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="font-mono text-sm text-fg">
                {shownWeight !== undefined ? (
                  <>
                    {shownWeight.toFixed(1)}
                    <span className="text-xs text-muted"> lb</span>
                  </>
                ) : (
                  <span className="text-subtle">no weigh-in</span>
                )}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-[10px] text-subtle">
              <span>
                Week of{" "}
                {new Date(weekInfo.weekStart).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>
                {weekInfo.weekAvg !== null
                  ? `${weekInfo.weekAvg.toFixed(1)} lb avg · ${weekInfo.count} ${
                      weekInfo.count === 1 ? "entry" : "entries"
                    }`
                  : "no entries this week"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
