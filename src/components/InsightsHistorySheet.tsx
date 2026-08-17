import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Insight, InsightCoach, InsightStatus } from "../db/types";

const TRANSITION_MS = 280;

const COACH_LABELS: Record<InsightCoach, string> = {
  home: "Alfred",
  fitness: "Jarvis",
  macros: "Sebastian",
  goals: "Benson",
  health: "Cornelius",
};

const COACH_ORDER: InsightCoach[] = [
  "home",
  "fitness",
  "macros",
  "goals",
  "health",
];

type StatusFilter = "all" | InsightStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  new: "Unread",
  seen: "Seen",
  dismissed: "Dismissed",
  accepted: "Accepted",
};

const STATUS_ORDER: StatusFilter[] = [
  "all",
  "new",
  "seen",
  "dismissed",
  "accepted",
];

interface Props {
  onClose: () => void;
}

// Full-screen sheet that lists every insight the passive layer has ever
// generated, grouped by day. Filter chips narrow by coach and status.
// Tap a row to expand its body inline. Dismissed/accepted rows can be
// restored to "new" so they show up on Home again.
export default function InsightsHistorySheet({ onClose }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const allInsights =
    useLiveQuery(async () => {
      const rows = await db.insights.orderBy("createdAt").reverse().toArray();
      // The Phase 1 demo row is noise for a history view — it never
      // reflected real data. Filter it out so the log stays useful.
      return rows.filter((i) => i.kind !== "phase1_demo");
    }) ?? [];

  const [coachFilters, setCoachFilters] = useState<InsightCoach[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleCoach = (c: InsightCoach) => {
    setCoachFilters((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
    );
  };

  const toggleExpanded = (id: number) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return allInsights.filter((i) => {
      if (coachFilters.length > 0 && !coachFilters.includes(i.coach))
        return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });
  }, [allInsights, coachFilters, statusFilter]);

  // Group by day (using the insight's `date` field — the day the insight
  // was authored, not created-at timestamp).
  const grouped = useMemo(() => {
    const map = new Map<number, Insight[]>();
    for (const i of filtered) {
      const arr = map.get(i.date) ?? [];
      arr.push(i);
      map.set(i.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const restore = async (id: number) => {
    await db.insights.update(id, {
      status: "new",
      updatedAt: Date.now(),
    });
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
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Insight history
          </span>
          <span className="w-12 text-right font-mono text-[11px] text-subtle">
            {filtered.length}
          </span>
        </div>

        {/* Filter row: status pills first, then coach chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-[18px] pb-3 [&::-webkit-scrollbar]:hidden">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] transition ${
                statusFilter === s
                  ? "bg-accent-soft text-accent-fg"
                  : "border border-border bg-surface text-subtle hover:text-fg"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          <span className="mx-1 h-4 w-px flex-shrink-0 bg-border" />
          {COACH_ORDER.map((c) => {
            const active = coachFilters.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCoach(c)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] transition ${
                  active
                    ? "bg-accent text-[#0a160d]"
                    : "border border-border bg-surface text-subtle hover:text-fg"
                }`}
              >
                {COACH_LABELS[c]}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-8 [&::-webkit-scrollbar]:hidden">
          {allInsights.length === 0 ? (
            <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              No insights yet. The AI needs a bit of data to work from —
              log a meal, finish a workout, and check back.
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              No insights match the current filter.
            </div>
          ) : (
            grouped.map(([day, rows]) => (
              <div key={day} className="mb-4">
                <div className="mx-1.5 mb-1.5 flex items-baseline justify-between">
                  <h3 className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                    {formatDayHeader(day)}
                  </h3>
                  <span className="font-mono text-[11px] text-subtle">
                    {rows.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                  {rows.map((row) => (
                    <HistoryRow
                      key={row.id}
                      row={row}
                      isExpanded={expanded.has(row.id!)}
                      onToggle={() => toggleExpanded(row.id!)}
                      onRestore={() => restore(row.id!)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function HistoryRow({
  row,
  isExpanded,
  onToggle,
  onRestore,
}: {
  row: Insight;
  isExpanded: boolean;
  onToggle: () => void;
  onRestore: () => void;
}) {
  const showRestore =
    row.status === "dismissed" || row.status === "accepted";
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle">
              {COACH_LABELS[row.coach]}
            </span>
            <StatusPill status={row.status} />
          </div>
          <div className="mt-1 text-sm font-medium leading-tight text-fg">
            {row.title}
          </div>
          {!isExpanded && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {row.body}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 font-mono text-[10px] text-subtle">
          {formatShortTime(row.createdAt)}
        </div>
      </button>
      {isExpanded && (
        <div className="px-3.5 pb-3">
          <div className="text-sm leading-relaxed text-fg">{row.body}</div>
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-subtle">
            <span>{row.kind}</span>
            <span>·</span>
            <span>{row.model}</span>
            {showRestore && (
              <>
                <span className="flex-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore();
                  }}
                  className="rounded-[8px] border border-border bg-surface px-2 py-1 uppercase tracking-[0.04em] text-fg hover:border-border-strong"
                >
                  Restore
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: InsightStatus }) {
  const label =
    status === "new"
      ? "Unread"
      : status === "seen"
        ? "Seen"
        : status === "dismissed"
          ? "Dismissed"
          : "Accepted";
  const color =
    status === "new"
      ? "var(--color-accent-fg)"
      : status === "accepted"
        ? "var(--color-accent-fg)"
        : "var(--color-subtle)";
  return (
    <span
      className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]"
      style={{
        color,
        boxShadow: `inset 0 0 0 1px ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

function formatDayHeader(dayMs: number): string {
  const d = new Date(dayMs);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = today.getTime() - 86_400_000;
  if (dayMs === today.getTime()) return "Today";
  if (dayMs === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatShortTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
