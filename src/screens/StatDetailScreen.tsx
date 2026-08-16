import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { tagByKey } from "../lib/dailyLog";
import {
  MONTHLY_CAPS,
  STATS,
  STAT_LABELS,
  TAG_GAINS,
  YEARLY_CAPS,
  computeStats,
  computeStatsByTag,
  endOfMonth,
  endOfYear,
  formatTimeUntil,
  maxCap,
  progressToNextRank,
  rankOf,
  startOfMonth,
  startOfYear,
  type Period,
  type Stat,
} from "../lib/stats";
import StatWheel from "../components/StatWheel";
import { Card, Section } from "../components/primitives";

interface Props {
  initialPeriod: Period;
  onClose: () => void;
}

// Full-screen push. Header with monthly/yearly toggle, live countdown to
// reset, wheel, per-stat numbers with next-rank hint, and a per-tag
// breakdown of where the points came from.
export default function StatDetailScreen({ initialPeriod, onClose }: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 260);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const winStart = period === "month" ? startOfMonth() : startOfYear();
  const winEnd = period === "month" ? endOfMonth() : endOfYear();
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
  const byTag = useMemo(() => computeStatsByTag(logs), [logs]);
  const caps = period === "month" ? MONTHLY_CAPS : YEARLY_CAPS;

  // Live-updating "resets in Xd Yh". Ticks every minute so we don't churn
  // the render loop on second-granularity for something days-scale.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const resetIn = formatTimeUntil(winEnd);

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
            Calendar
          </button>
        </div>

        <header className="px-1.5 pb-3 pt-1">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Stats
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {period === "month" ? "this month" : "this year"} · resets in{" "}
            {resetIn}
          </div>
        </header>

        {/* Period toggle */}
        <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface p-1">
          {(["month", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${
                period === p
                  ? "bg-accent text-[#0a160d]"
                  : "text-muted hover:text-fg"
              }`}
            >
              {p === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>

        {/* Wheel */}
        <div className="mb-3 flex items-center justify-center rounded-[16px] border border-border bg-surface py-3">
          <StatWheel values={values} caps={caps} size={320} />
        </div>

        {/* Per-stat rows */}
        <Section title="Ranks">
          <Card>
            {STATS.map((s, i) => (
              <StatRow
                key={s}
                stat={s}
                value={values[s]}
                thresholds={caps[s]}
                isFirst={i === 0}
              />
            ))}
          </Card>
        </Section>

        {/* Per-tag breakdown */}
        <Section
          title="Sources"
          meta={`${Object.keys(byTag).length} ${Object.keys(byTag).length === 1 ? "tag" : "tags"}`}
        >
          <Card>
            {Object.keys(byTag).length === 0 ? (
              <div className="px-3.5 py-4 text-sm text-muted">
                No tagged entries {period === "month" ? "this month" : "this year"}.
              </div>
            ) : (
              Object.entries(byTag)
                .sort(([, a], [, b]) => sumOf(b) - sumOf(a))
                .map(([tagKey, gained], i) => (
                  <TagBreakdownRow
                    key={tagKey}
                    tagKey={tagKey}
                    gained={gained}
                    isFirst={i === 0}
                  />
                ))
            )}
          </Card>
        </Section>

        {/* Reference: what every tag gives, always visible so the user can
            plan their day intentionally. */}
        <Section title="Tag values" meta="reference">
          <Card>
            {Object.keys(TAG_GAINS).map((tagKey, i) => (
              <TagReferenceRow key={tagKey} tagKey={tagKey} isFirst={i === 0} />
            ))}
          </Card>
        </Section>
      </div>
    </div>
  );
}

function sumOf(g: Record<Stat, number>): number {
  return STATS.reduce((s, k) => s + g[k], 0);
}

function StatRow({
  stat,
  value,
  thresholds,
  isFirst,
}: {
  stat: Stat;
  value: number;
  thresholds: number[];
  isFirst: boolean;
}) {
  const rank = rankOf(value, thresholds);
  const max = maxCap(thresholds);
  const nextIdx = rank < thresholds.length ? rank : thresholds.length - 1;
  const nextThreshold = thresholds[nextIdx];
  const pct = progressToNextRank(value, thresholds);
  const maxed = rank >= thresholds.length;

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${isFirst ? "" : "border-t border-border"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-fg">
            {STAT_LABELS[stat]}
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
              maxed ? "text-[oklch(0.80_0.13_88)]" : "text-subtle"
            }`}
          >
            {maxed ? "MAX" : `Rank ${rank}`}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-[1px] bg-surface-2">
          <span
            className="block h-full bg-accent transition-[width]"
            style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-[10px] text-subtle">
          {maxed
            ? `${value} / ${max} (max)`
            : `${value} / ${nextThreshold} to rank ${rank + 1} · ${Math.round(pct * 100)}%`}
        </div>
      </div>
      <div className="font-mono text-lg tabular-nums text-fg">
        {value}
      </div>
    </div>
  );
}

function TagBreakdownRow({
  tagKey,
  gained,
  isFirst,
}: {
  tagKey: string;
  gained: Record<Stat, number>;
  isFirst: boolean;
}) {
  const t = tagByKey(tagKey);
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${isFirst ? "" : "border-t border-border"}`}
    >
      {t && (
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: t.color }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg">{t?.label ?? tagKey}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {STATS.filter((s) => gained[s] > 0)
            .map((s) => `${STAT_LABELS[s]} ${gained[s]}`)
            .join(" · ")}
        </div>
      </div>
      <div className="font-mono text-sm text-fg">{sumOf(gained)}</div>
    </div>
  );
}

function TagReferenceRow({
  tagKey,
  isFirst,
}: {
  tagKey: string;
  isFirst: boolean;
}) {
  const t = tagByKey(tagKey);
  const gains = TAG_GAINS[tagKey] ?? {};
  const entries = STATS.filter((s) => (gains[s] ?? 0) > 0).map(
    (s) => `${STAT_LABELS[s]} ${gains[s]}`,
  );
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2 ${isFirst ? "" : "border-t border-border"}`}
    >
      {t && (
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: t.color }}
        />
      )}
      <span className="text-sm text-fg">{t?.label ?? tagKey}</span>
      <span className="ml-auto font-mono text-[11px] text-muted">
        {entries.length > 0 ? entries.join(" · ") : "exempt"}
      </span>
    </div>
  );
}

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
