import { useEffect, useMemo, useState } from "react";
import type { CardioSession } from "../db/types";
import { CARDIO_SCHEDULE } from "../lib/userProgram";

// dow → 2-letter tag for the scheduled cardio kind, if any.
const CARDIO_TAG: Record<number, string | undefined> = (() => {
  const m: Record<number, string | undefined> = {};
  for (const [dow, slot] of Object.entries(CARDIO_SCHEDULE)) {
    if (!slot) continue;
    m[Number(dow)] = slot.key === "hiit" ? "HIT" : "Z2";
  }
  return m;
})();

interface Props {
  sessions: CardioSession[];
}

function startOfDay(d: Date | number): number {
  const dt = typeof d === "number" ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

// Cardio-only month calendar. Zone 2 (LISS) days get a soft accent fill;
// HIIT days get a full accent fill; both kinds on the same day render as
// vertical split. Tap a day to see modality + duration underneath.
export default function CardioCalendar({ sessions }: Props) {
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

  const a = new Date(anchor);
  const year = a.getFullYear();
  const month = a.getMonth();
  const monthName = a.toLocaleDateString(undefined, { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const m = new Map<number, CardioSession[]>();
    for (const c of sessions) {
      const key = startOfDay(c.date);
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [sessions]);

  const grid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const cells: (
      | {
          day: number;
          date: number;
          sessions: CardioSession[];
          isToday: boolean;
          isFuture: boolean;
        }
      | null
    )[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d).getTime();
      cells.push({
        day: d,
        date,
        sessions: byDay.get(date) ?? [],
        isToday: date === todayMs,
        isFuture: date > todayMs,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, daysInMonth, byDay, todayMs]);

  const monthCount = useMemo(
    () =>
      Array.from(byDay.entries()).reduce((s, [k, arr]) => {
        const d = new Date(k);
        return d.getFullYear() === year && d.getMonth() === month
          ? s + arr.length
          : s;
      }, 0),
    [byDay, year, month],
  );

  const atCurrent =
    year === today0.getFullYear() && month === today0.getMonth();
  const selectedCell =
    selected !== null ? grid.find((c) => c && c.date === selected) ?? null : null;

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-fg">{monthName}</span>
          <span className="font-mono text-[11px] text-subtle">
            {monthCount} {monthCount === 1 ? "session" : "sessions"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() => setAnchor(new Date(year, month - 1, 1).getTime())}
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg"
          >
            ‹
          </button>
          <button
            aria-label="Next month"
            disabled={atCurrent}
            onClick={() => setAnchor(new Date(year, month + 1, 1).getTime())}
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
          const hasLiss = cell.sessions.some((s) => s.kind === "liss");
          const hasHiit = cell.sessions.some((s) => s.kind === "hiit");
          const isSel = selected === cell.date;
          const dow = new Date(cell.date).getDay();
          const scheduledTag = CARDIO_TAG[dow];
          const isScheduled = scheduledTag !== undefined;
          const hasAny = hasLiss || hasHiit;
          const bg = fillFor(hasLiss, hasHiit, cell.isFuture, isScheduled);
          const textCol = hasHiit
            ? "text-[#0a160d] font-medium"
            : hasLiss
              ? "text-accent-fg"
              : cell.isFuture
                ? "text-subtle/40"
                : "text-subtle";
          return (
            <button
              key={i}
              onClick={() =>
                setSelected(isSel ? null : cell.date)
              }
              className={`relative grid aspect-square place-items-center rounded-[6px] font-mono text-[10px] transition ${textCol}`}
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
              {!hasAny && isScheduled && (
                <span className="absolute right-[2px] top-[1px] whitespace-nowrap text-[7px] leading-none text-subtle/70">
                  {scheduledTag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {selectedCell.sessions.length === 0 ? (
            <div className="text-center font-mono text-[11px] text-subtle">
              {new Date(selectedCell.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {" — no cardio"}
            </div>
          ) : (
            <div className="space-y-1">
              {selectedCell.sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-baseline justify-between font-mono text-[11px]"
                >
                  <span className="text-fg">
                    {s.kind === "hiit" ? "HIIT" : "Zone 2"}
                    {s.modality ? ` · ${s.modality}` : ""}
                  </span>
                  <span className="text-muted">{s.durationMin} min</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fillFor(
  hasLiss: boolean,
  hasHiit: boolean,
  isFuture: boolean,
  isScheduled: boolean,
): string {
  const liss = "color-mix(in oklab, var(--color-accent) 22%, var(--color-surface-2))";
  const hiit = "var(--color-accent)";
  if (hasLiss && hasHiit) {
    return `linear-gradient(90deg, ${liss} 0%, ${liss} 50%, ${hiit} 50%, ${hiit} 100%)`;
  }
  if (hasHiit) return hiit;
  if (hasLiss) return liss;
  // No cardio logged that day: darker for rest, surface-2 for scheduled
  // (past = "you missed it", future = "coming up").
  if (!isScheduled) return "var(--color-bg)";
  return isFuture ? "transparent" : "var(--color-surface-2)";
}
