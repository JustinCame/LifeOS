import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import type { HealthLog } from "../db/types";
import {
  computeStreak,
  getGoal,
  startOfToday,
  type DailyMetricType,
} from "../lib/health";
import WeightHeatmap from "../components/WeightHeatmap";
import ExportSheet from "../components/ExportSheet";
import { exportHealthText } from "../lib/exports";

type LoggableType = "weight" | "sleep" | "water";

interface MetricSpec {
  type: LoggableType;
  label: string;
  unit: string;
  step: string;
  hint: string;
  format: (v: number) => string;
}

const WEIGHT_SPEC: MetricSpec = {
  type: "weight",
  label: "Weight",
  unit: "lb",
  step: "0.1",
  hint: "Today's weight",
  format: (v) => v.toFixed(1),
};

const SLEEP_SPEC: MetricSpec = {
  type: "sleep",
  label: "Sleep",
  unit: "h",
  step: "0.5",
  hint: "Hours last night",
  format: (v) => (Number.isInteger(v) ? v.toString() : v.toFixed(1)),
};

const WATER_SPEC: MetricSpec = {
  type: "water",
  label: "Water",
  unit: "cups",
  step: "0.5",
  hint: "Cups today",
  format: (v) => (Number.isInteger(v) ? v.toString() : v.toFixed(1)),
};

// Filter chips shown above the weight trend line. `days: null` = all-time.
interface TrendWindow {
  label: string;
  days: number | null;
}
const WEIGHT_WINDOWS: TrendWindow[] = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

interface Props {
  onOpenMetric: (type: DailyMetricType) => void;
}

export default function Health({ onOpenMetric }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const today = startOfToday();
  const fourteenDaysAgo = today - 13 * 86_400_000;
  // Wide enough that sleep/water 14-day trends have room; weight has its
  // own all-time query below.
  const windowStart = today - 365 * 86_400_000;

  const recentLogs =
    useLiveQuery(
      () =>
        db.health_logs
          .where("date")
          .between(windowStart, today, true, true)
          .toArray(),
      [windowStart, today],
    ) ?? [];

  // All weight logs, ever — small dataset (one value per day at most) so the
  // full history is cheap. Needed so the trend card can filter across any
  // window the user picks (1W ... All) and the calendar can page back years.
  const allWeightLogs =
    useLiveQuery(
      () => db.health_logs.where("type").equals("weight").toArray(),
    ) ?? [];

  const todayLogs = useMemo(
    () => recentLogs.filter((l) => l.date === today),
    [recentLogs, today],
  );
  const sleepLogs14 = useMemo(
    () =>
      recentLogs.filter(
        (l) => l.type === "sleep" && l.date >= fourteenDaysAgo,
      ),
    [recentLogs, fourteenDaysAgo],
  );
  const waterLogs14 = useMemo(
    () =>
      recentLogs.filter(
        (l) => l.type === "water" && l.date >= fourteenDaysAgo,
      ),
    [recentLogs, fourteenDaysAgo],
  );

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              Health
            </h1>
            <button
              onClick={() => setExportOpen(true)}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
            >
              Export
            </button>
          </div>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            weight · sleep · water
          </div>
        </header>

        <Section title="Today">
          <Card>
            <QuickLogRow
              spec={WEIGHT_SPEC}
              todayValue={todayLogs.find((l) => l.type === "weight")?.value}
              isFirst
            />
            <TappableMetricRow
              spec={SLEEP_SPEC}
              todayValue={todayLogs.find((l) => l.type === "sleep")?.value}
              onTap={() => onOpenMetric("sleep")}
            />
            <TappableMetricRow
              spec={WATER_SPEC}
              todayValue={todayLogs.find((l) => l.type === "water")?.value}
              onTap={() => onOpenMetric("water")}
            />
          </Card>
        </Section>

        <Section title="Weight">
          <div className="space-y-3">
            <WeightHeatmap logs={allWeightLogs} />
            <TrendCard
              spec={WEIGHT_SPEC}
              logs={allWeightLogs}
              windows={WEIGHT_WINDOWS}
              defaultWindowIdx={2}
            />
          </div>
        </Section>

        <Section title="Sleep">
          <TrendCard spec={SLEEP_SPEC} logs={sleepLogs14} />
        </Section>

        <Section title="Water">
          <TrendCard spec={WATER_SPEC} logs={waterLogs14} />
        </Section>
      </div>

      {exportOpen && (
        <ExportSheet
          title="Weight"
          generate={exportHealthText}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

function QuickLogRow({
  spec,
  todayValue,
  isFirst,
}: {
  spec: MetricSpec;
  todayValue: number | undefined;
  isFirst: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(draft);
    if (Number.isNaN(v)) return;
    setBusy(true);
    try {
      const today = startOfToday();
      const existing = await db.health_logs
        .where("[date+type]")
        .equals([today, spec.type])
        .first();
      if (existing) {
        await db.health_logs.update(existing.id!, { value: v });
      } else {
        await db.health_logs.add({
          date: today,
          type: spec.type,
          value: v,
          unit: spec.unit,
          createdAt: Date.now(),
        });
      }
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${
        isFirst ? "" : "border-t border-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="text-base leading-tight text-fg">{spec.label}</div>
          {todayValue !== undefined && (
            <span className="font-mono text-xs text-accent-fg">
              {spec.format(todayValue)}
              {spec.unit}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {spec.hint}
        </div>
      </div>
      <form onSubmit={save} className="flex items-center gap-1.5">
        <input
          type="number"
          step={spec.step}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            todayValue !== undefined ? spec.format(todayValue) : "—"
          }
          className="w-20 rounded-[8px] border border-border bg-surface px-2 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition ${
            draft.trim() && !busy
              ? "bg-accent text-[#0a160d]"
              : "bg-surface-2 text-subtle"
          }`}
        >
          Log
        </button>
      </form>
    </div>
  );
}

// Row that mirrors the Today screen's stat tile: label, value/goal, progress
// bar, and a chevron. Tapping it opens the shared MetricSheet for that metric
// so editing happens in one place across Today and Health.
function TappableMetricRow({
  spec,
  todayValue,
  onTap,
}: {
  spec: MetricSpec;
  todayValue: number | undefined;
  onTap: () => void;
}) {
  const goal =
    useLiveQuery(() => getGoal(spec.type as DailyMetricType), [spec.type]) ??
    0;
  const streak =
    useLiveQuery(
      () => computeStreak(spec.type as DailyMetricType),
      [spec.type],
    ) ?? 0;
  const value = todayValue ?? 0;
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  return (
    <button
      onClick={onTap}
      className="flex w-full items-center gap-3 border-t border-border px-3.5 py-3 text-left hover:bg-surface-2 active:scale-[0.995]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <div className="text-base leading-tight text-fg">{spec.label}</div>
            {streak > 0 && (
              <span
                className={`font-mono text-[10px] ${
                  streak >= 7 ? "text-accent-fg" : "text-muted"
                }`}
              >
                {streak}d
              </span>
            )}
          </div>
          <div className="font-mono text-xs">
            <span className="text-fg">
              {todayValue !== undefined ? spec.format(value) : "—"}
              {spec.unit}
            </span>
            {goal > 0 && (
              <span className="text-subtle">
                {" "}
                / {spec.format(goal)}
                {spec.unit}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-[1px] bg-surface-2">
          <span
            className="block h-full bg-accent transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

function TrendCard({
  spec,
  logs,
  windows,
  defaultWindowIdx = 0,
}: {
  spec: MetricSpec;
  logs: HealthLog[];
  windows?: TrendWindow[];
  defaultWindowIdx?: number;
}) {
  const [windowIdx, setWindowIdx] = useState(defaultWindowIdx);
  const currentWindow = windows?.[windowIdx];

  // If a filter is active, drop entries older than the cutoff; otherwise use
  // everything the parent handed us (sleep/water pass no windows and get the
  // original 14-day behavior).
  const filtered = useMemo(() => {
    if (!currentWindow || currentWindow.days === null) return logs;
    const cutoff = Date.now() - currentWindow.days * 86_400_000;
    return logs.filter((l) => l.date >= cutoff);
  }, [logs, currentWindow]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.date - b.date),
    [filtered],
  );
  const values = sorted.map((l) => l.value);
  const latest = sorted[sorted.length - 1]?.value;
  const first = sorted[0]?.value;
  const delta =
    latest !== undefined && first !== undefined ? latest - first : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;

  const W = 280;
  const H = 44;
  const path =
    sorted.length === 0
      ? ""
      : sorted
          .map((l, i) => {
            const x =
              sorted.length === 1
                ? W / 2
                : (i / (sorted.length - 1)) * (W - 6) + 3;
            const y = H - 4 - ((l.value - min) / range) * (H - 8);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");

  // Color the delta: weight likes going down; sleep & water like going up.
  const deltaIsGood = spec.type === "weight" ? delta < 0 : delta > 0;

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-fg">{spec.label} trend</div>
        {latest !== undefined && (
          <div className="font-mono text-xs">
            <span className="text-fg">
              {spec.format(latest)}
              {spec.unit}
            </span>
            {sorted.length >= 2 && (
              <span
                className={`ml-2 ${
                  delta === 0
                    ? "text-muted"
                    : deltaIsGood
                      ? "text-accent-fg"
                      : "text-subtle"
                }`}
              >
                {delta > 0 ? "+" : delta < 0 ? "-" : ""}
                {spec.format(Math.abs(delta))}
              </span>
            )}
          </div>
        )}
      </div>
      {windows && windows.length > 0 && (
        <div className="mt-2 flex gap-1">
          {windows.map((w, i) => (
            <button
              key={w.label}
              onClick={() => setWindowIdx(i)}
              className={`flex-1 rounded-[6px] px-1 py-1 font-mono text-[10px] transition ${
                i === windowIdx
                  ? "bg-accent-soft text-accent-fg"
                  : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        {sorted.length === 0 ? (
          <div className="font-mono text-[11px] text-subtle">no data</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-11 w-full"
          >
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {sorted.map((l, i) => {
              const x =
                sorted.length === 1
                  ? W / 2
                  : (i / (sorted.length - 1)) * (W - 6) + 3;
              const y = H - 4 - ((l.value - min) / range) * (H - 8);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="1.6"
                  fill="var(--color-accent)"
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>{sorted.length} entries</span>
        {sorted.length >= 2 && (
          <span>
            {spec.format(min)}–{spec.format(max)}
            {spec.unit}
          </span>
        )}
      </div>
    </div>
  );
}
