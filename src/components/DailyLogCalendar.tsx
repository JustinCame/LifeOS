import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { DailyLog } from "../db/types";
import { tagByKey } from "../lib/dailyLog";
import { startOfDay } from "../lib/habits";

// Sunday-start weekday header, matching WeightHeatmap.
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Month calendar showing which days have a daily-log entry, with small
// color dots per tag in the top-right of each logged day. Tap a day to
// read the entry inline below the grid.
export default function DailyLogCalendar() {
  const today0 = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayMs = today0.getTime();

  const [monthAnchor, setMonthAnchor] = useState(() =>
    new Date(today0.getFullYear(), today0.getMonth(), 1).getTime(),
  );
  const anchor = new Date(monthAnchor);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthName = anchor.toLocaleDateString(undefined, { month: "long" });

  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [monthAnchor]);

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

  const monthLogs =
    useLiveQuery(
      () =>
        db.daily_logs.where("date").between(monthStart, monthEnd, true, true).toArray(),
      [monthStart, monthEnd],
    ) ?? [];

  const logByDay = useMemo(() => {
    const m = new Map<number, DailyLog>();
    for (const l of monthLogs) m.set(startOfDay(l.date), l);
    return m;
  }, [monthLogs]);

  const grid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const cells: (
      | {
          day: number;
          date: number;
          log: DailyLog | undefined;
          isFuture: boolean;
          isToday: boolean;
        }
      | null
    )[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d).getTime();
      cells.push({
        day: d,
        date,
        log: logByDay.get(date),
        isFuture: date > todayMs,
        isToday: date === todayMs,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, daysInMonth, logByDay, todayMs]);

  const selectedLog = selected !== null ? logByDay.get(selected) : undefined;

  const prevMonth = () =>
    setMonthAnchor(new Date(year, month - 1, 1).getTime());
  const nextMonth = () => {
    const next = new Date(year, month + 1, 1).getTime();
    if (next > new Date(today0.getFullYear(), today0.getMonth(), 1).getTime())
      return;
    setMonthAnchor(next);
  };
  const atCurrentMonth =
    year === today0.getFullYear() && month === today0.getMonth();

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Journal
        </div>
        <div className="font-mono text-[11px] tracking-[0.02em] text-subtle">
          {monthLogs.length} {monthLogs.length === 1 ? "entry" : "entries"}
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

      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (cell === null) return <div key={i} className="aspect-square" />;
          const isSelected = selected !== null && cell.date === selected;
          const hasLog = !!cell.log;
          const tagColors = cell.log?.tags
            .map((k) => tagByKey(k)?.color)
            .filter((c): c is string => !!c) ?? [];
          const background = fillFromColors(tagColors, hasLog);
          return (
            <button
              key={i}
              disabled={cell.isFuture}
              onClick={() => setSelected(cell.date)}
              className="relative grid aspect-square place-items-center rounded-[6px]"
              style={{
                background,
                opacity: cell.isFuture ? 0.3 : 1,
                boxShadow: isSelected
                  ? "inset 0 0 0 1.5px var(--color-fg)"
                  : cell.isToday
                    ? "inset 0 0 0 1px var(--color-fg)"
                    : "none",
              }}
            >
              <span
                className={`font-mono text-xs ${
                  tagColors.length > 0 ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" : "text-fg"
                }`}
              >
                {cell.day}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected-day readout */}
      <div className="mt-3 border-t border-border pt-3">
        {selected === null ? (
          <div className="text-center font-mono text-[11px] text-subtle">
            Tap a day to read that entry
          </div>
        ) : selectedLog ? (
          <SelectedEntry log={selectedLog} />
        ) : (
          <div className="text-center font-mono text-[11px] text-subtle">
            {new Date(selected).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            {" — no entry"}
          </div>
        )}
      </div>
    </div>
  );
}

// Build the cell background from a list of tag colors:
//   0 tags  → transparent (no entry) or surface-2 (text-only entry)
//   1 tag   → solid color
//   2+ tags → vertical hard-edged stripes so each color is distinct
function fillFromColors(colors: string[], hasLog: boolean): string {
  if (colors.length === 0) {
    return hasLog ? "var(--color-surface-2)" : "transparent";
  }
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops: string[] = [];
  colors.forEach((c, i) => {
    const start = (i * step).toFixed(2);
    const end = ((i + 1) * step).toFixed(2);
    stops.push(`${c} ${start}%`, `${c} ${end}%`);
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function SelectedEntry({ log }: { log: DailyLog }) {
  const dateStr = new Date(log.date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[11px] text-subtle">{dateStr}</span>
      </div>
      {log.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {log.tags.map((k) => {
            const t = tagByKey(k);
            if (!t) return null;
            return (
              <span
                key={k}
                className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ background: t.color }}
              >
                {t.label}
              </span>
            );
          })}
        </div>
      )}
      {log.text.trim() ? (
        <div className="whitespace-pre-wrap text-sm leading-snug text-fg">
          {log.text}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-subtle">
          Tags only — no text written.
        </div>
      )}
    </div>
  );
}

