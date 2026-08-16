import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  MONTHLY_CAPS,
  YEARLY_CAPS,
  computeStats,
  endOfMonth,
  endOfYear,
  formatTimeUntil,
  startOfMonth,
  startOfYear,
  type Period,
} from "../lib/stats";
import StatWheel from "./StatWheel";

interface Props {
  onOpenDetail: (period: Period) => void;
}

// Card with the monthly/yearly toggle + the wheel + a "view details"
// button. Sits above the + Add event button on the Calendar screen.
export default function StatWheelCard({ onOpenDetail }: Props) {
  const [period, setPeriod] = useState<Period>("month");

  const winStart = period === "month" ? startOfMonth() : startOfYear();
  const winEnd = period === "month" ? endOfMonth() : endOfYear();
  // -1 on the end so between() with inclusive works cleanly — the window is
  // "first millisecond of period → last millisecond".
  const logs =
    useLiveQuery(
      () =>
        db.daily_logs
          .where("date")
          .between(winStart, winEnd - 1, true, true)
          .toArray(),
      [winStart, winEnd],
    ) ?? [];

  const values = computeStats(logs);
  const caps = period === "month" ? MONTHLY_CAPS : YEARLY_CAPS;
  const resetIn = formatTimeUntil(winEnd);

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-border bg-bg p-1">
          {(["month", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                period === p
                  ? "bg-surface-2 text-fg"
                  : "text-subtle hover:text-fg"
              }`}
            >
              {p === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] tracking-[0.02em] text-subtle">
          resets in {resetIn}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <StatWheel values={values} caps={caps} />
      </div>

      <button
        onClick={() => onOpenDetail(period)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-bg px-3 py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
      >
        View details ›
      </button>
    </div>
  );
}
