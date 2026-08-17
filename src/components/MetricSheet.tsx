import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  METRIC_CONFIG,
  addToDaily,
  computeStreak,
  getGoal,
  setDailyValue,
  setGoal,
  setSleepFromTimes,
  startOfToday,
  type DailyMetricType,
} from "../lib/health";

interface Props {
  // The metric to display. Parent only mounts this component when type is
  // non-null — there's no internal "closed" state.
  type: DailyMetricType;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function MetricSheet({ type, onClose }: Props) {
  const t = type;
  const config = METRIC_CONFIG[t];

  // Slide-in animation on mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const today = startOfToday();
  const log = useLiveQuery(
    () => db.health_logs.where("[date+type]").equals([today, t]).first(),
    [t, today],
  );
  const value = log?.value ?? 0;
  const goal = useLiveQuery(() => getGoal(t), [t]) ?? 0;
  const streak = useLiveQuery(() => computeStreak(t), [t]) ?? 0;

  const [setDraft, setSetDraft] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const submitSet = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(setDraft);
    if (Number.isNaN(v) || v < 0) return;
    setDailyValue(t, v);
    setSetDraft("");
  };

  const submitGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(goalDraft);
    if (Number.isNaN(v) || v <= 0) return;
    setGoal(t, v);
    setEditingGoal(false);
    setGoalDraft("");
  };

  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />

        {config && (
          <>
            <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
              <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
                {config.label}
              </span>
              <button
                onClick={close}
                className="px-1.5 py-1 text-base text-accent-fg"
              >
                Done
              </button>
            </div>

            <div className="overflow-y-auto px-[18px] pb-8 [&::-webkit-scrollbar]:hidden">
              {/* Big value + goal */}
              <div className="text-center pt-2">
                <div className="font-mono text-[44px] font-medium leading-none tracking-[-0.025em] text-fg">
                  {config.format(value)}
                  {config.unit && (
                    <span className="ml-1 text-2xl text-muted">
                      {config.unit}
                    </span>
                  )}
                </div>
                {!editingGoal ? (
                  <button
                    onClick={() => {
                      setEditingGoal(true);
                      setGoalDraft(String(goal));
                    }}
                    className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-subtle hover:text-fg"
                  >
                    of {config.format(goal)}
                    {config.unit} goal · edit
                  </button>
                ) : (
                  <form
                    onSubmit={submitGoal}
                    className="mt-2 flex items-center justify-center gap-1.5"
                  >
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      autoFocus
                      value={goalDraft}
                      onChange={(e) => setGoalDraft(e.target.value)}
                      className="w-24 rounded-[8px] border border-border bg-surface px-2 py-1 text-center font-mono text-sm outline-none"
                    />
                    <span className="text-xs text-muted">{config.unit}</span>
                    <button
                      type="submit"
                      className="rounded-[8px] bg-accent px-2.5 py-1 text-xs font-medium text-[#0a160d]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGoal(false)}
                      className="rounded-[8px] px-2 py-1 text-xs text-subtle hover:text-fg"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-5 h-1 overflow-hidden rounded-[1px] bg-surface-2">
                <span
                  className="block h-full bg-accent transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Streak */}
              <div className="mt-4 text-center font-mono text-sm">
                {streak === 0 ? (
                  <span className="text-muted">no streak yet</span>
                ) : (
                  <span className="text-accent-fg">
                    {streak}-day streak
                  </span>
                )}
              </div>

              {/* Sleep detail — bedtime + wake time inputs. Replaces the
                  generic quick-add / set-total UI for the sleep metric so
                  the duration is derived from the times rather than
                  entered directly. */}
              {t === "sleep" && (
                <SleepDetailForm
                  today={today}
                  bedtimeMs={log?.bedtimeMs}
                  wakeMs={log?.wakeMs}
                />
              )}

              {/* Quick add — hidden for sleep since duration comes from
                  the bedtime/wake inputs above. */}
              {t !== "sleep" && config.quickAdds.length > 0 && (
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {config.quickAdds.map((d) => (
                    <button
                      key={d}
                      onClick={() => addToDaily(t, d)}
                      className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm font-medium text-fg hover:border-border-strong active:scale-[0.98]"
                    >
                      +{config.format(d)}
                      {config.unit}
                    </button>
                  ))}
                </div>
              )}

              {/* Set exact value — hidden for sleep since duration is
                  derived from bedtime + wake. */}
              {t !== "sleep" && (
                <form onSubmit={submitSet} className="mt-3 flex gap-2">
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={setDraft}
                  onChange={(e) => setSetDraft(e.target.value)}
                  placeholder={`Set total (${config.unit || "value"})`}
                  className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-subtle"
                />
                <button
                  type="submit"
                  disabled={!setDraft.trim()}
                  className={`rounded-[10px] px-4 py-2.5 text-sm font-medium transition ${
                    setDraft.trim()
                      ? "bg-accent text-[#0a160d]"
                      : "bg-surface-2 text-subtle"
                  }`}
                >
                  Set
                </button>
                </form>
              )}

              {/* Reset */}
              {value > 0 && (
                <button
                  onClick={() => setDailyValue(t, 0)}
                  className="mt-3 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-subtle hover:border-border-strong hover:text-fg"
                >
                  Reset to 0
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Sleep entry — two <input type="time"> widgets, an auto-computed
// duration readout, and one Save button. Handles the common midnight-
// crossing case (bed at 23:30, wake at 07:00) by treating any bedtime
// that's chronologically after the wake time as belonging to the
// previous day.
function SleepDetailForm({
  today,
  bedtimeMs,
  wakeMs,
}: {
  today: number;
  bedtimeMs: number | undefined;
  wakeMs: number | undefined;
}) {
  // Seed the inputs from the stored timestamps if any, else with sensible
  // defaults (11pm bedtime, 7am wake — starting values, not silent writes).
  const [bed, setBed] = useState<string>(
    bedtimeMs !== undefined ? timeOfDay(bedtimeMs) : "23:00",
  );
  const [wake, setWake] = useState<string>(
    wakeMs !== undefined ? timeOfDay(wakeMs) : "07:00",
  );
  const [saving, setSaving] = useState(false);

  // If the sheet reopens with a stored value, refresh the inputs. Guarded
  // so the user's mid-edit values don't get clobbered on unrelated re-
  // renders.
  useEffect(() => {
    if (bedtimeMs !== undefined) setBed(timeOfDay(bedtimeMs));
    if (wakeMs !== undefined) setWake(timeOfDay(wakeMs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedtimeMs, wakeMs]);

  // Compute the ms timestamps + derived duration. Wake anchors to `today`
  // (00:00 + wake time). Bed anchors to `today` if it's before the wake
  // time, else to the previous day.
  const { computed, hours } = useMemo(() => {
    const [bh, bm] = bed.split(":").map((s) => parseInt(s, 10));
    const [wh, wm] = wake.split(":").map((s) => parseInt(s, 10));
    if (
      Number.isNaN(bh) ||
      Number.isNaN(bm) ||
      Number.isNaN(wh) ||
      Number.isNaN(wm)
    ) {
      return { computed: null, hours: 0 };
    }
    const bedMin = bh * 60 + bm;
    const wakeMin = wh * 60 + wm;
    const wakeTs = today + wakeMin * 60_000;
    // If bedtime is later in the day than wake time, it must have been
    // yesterday. Otherwise it's earlier the same day (e.g. a nap or a
    // very short overnight, both rare but handled).
    const bedTs =
      bedMin > wakeMin
        ? today - 24 * 3_600_000 + bedMin * 60_000
        : today + bedMin * 60_000;
    return { computed: { bedTs, wakeTs }, hours: (wakeTs - bedTs) / 3_600_000 };
  }, [bed, wake, today]);

  const onSave = async () => {
    if (!computed) return;
    setSaving(true);
    await setSleepFromTimes(computed.bedTs, computed.wakeTs, today);
    // Brief settle so the button state updates before parent's useLiveQuery
    // repaints. No spinner — the save is fast enough that a flash is enough.
    window.setTimeout(() => setSaving(false), 150);
  };

  const hoursLabel =
    hours > 0
      ? `${Math.floor(hours)}h ${Math.round((hours - Math.floor(hours)) * 60)}m`
      : "—";

  return (
    <div className="mt-6 overflow-hidden rounded-[16px] border border-border bg-surface p-3">
      {/* Grid uses explicit minmax(0, 1fr) so each column can actually
          shrink below the intrinsic content width of iOS Safari's native
          time picker (Tailwind's default grid-cols-2 = 1fr 1fr won't
          shrink). Combined with appearance-none, this reliably keeps the
          inputs within their card even on narrow phones. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className="block min-w-0">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
            Bedtime
          </span>
          <input
            type="time"
            value={bed}
            onChange={(e) => setBed(e.target.value)}
            className="block w-full min-w-0 appearance-none rounded-[8px] border border-border bg-bg px-2 py-2 text-sm outline-none"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
            Wake time
          </span>
          <input
            type="time"
            value={wake}
            onChange={(e) => setWake(e.target.value)}
            className="block w-full min-w-0 appearance-none rounded-[8px] border border-border bg-bg px-2 py-2 text-sm outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="font-mono text-sm text-fg">
          {hoursLabel}
          <span className="ml-1 text-xs text-subtle">total</span>
        </div>
        <button
          onClick={onSave}
          disabled={!computed || saving}
          className={`rounded-[10px] px-4 py-2 text-sm font-medium transition ${
            computed && !saving
              ? "bg-accent text-[#0a160d]"
              : "bg-surface-2 text-subtle"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Format a wall-clock timestamp as 24h "HH:MM" for the <input type="time">
// value. Uses local time.
function timeOfDay(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
