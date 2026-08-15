import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section, ListRow, IconButton, Input } from "../components/primitives";
import { db } from "../db";
import type { Task } from "../db/types";
import { listTomorrow, formatEventTime, type CalEvent } from "../lib/calendar";
import {
  METRIC_CONFIG,
  computeStreak,
  getGoal,
  startOfToday,
  startOfWeek,
  type DailyMetricType,
} from "../lib/health";
import WeeklyReviewSheet from "../components/WeeklyReviewSheet";
import {
  disableNotifications,
  enableNotifications,
  getNotificationState,
  isPushSupported,
  type NotificationState,
} from "../lib/notifications";

interface HomeProps {
  onOpenMetric: (type: DailyMetricType) => void;
  onOpenBackup: () => void;
}

export default function Home({ onOpenMetric, onOpenBackup }: HomeProps) {
  const [reviewOpen, setReviewOpen] = useState(false);

  // --- Calendar (live, tomorrow) ---
  const authSetting = useLiveQuery(() => db.settings.get("google_auth"));
  const accessToken =
    (authSetting?.value as { accessToken?: string } | undefined)?.accessToken;
  const isAuthed = !!accessToken;

  const [schedule, setSchedule] = useState<CalEvent[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setSchedule([]);
      setScheduleError(null);
      setScheduleLoading(false);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    listTomorrow()
      .then((events) => { if (!cancelled) setSchedule(events); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setScheduleError(
          msg === "not_authenticated" ? "Session expired — sign in again." : msg,
        );
      })
      .finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken]);

  // --- Tasks (Dexie, this week only — older tasks remain in IDB but hidden) ---
  const weekStart = startOfWeek();
  const tasks =
    useLiveQuery(
      () =>
        db.tasks
          .where("createdAt")
          .aboveOrEqual(weekStart)
          .reverse()
          .toArray(),
      [weekStart],
    ) ?? [];
  const [taskDraft, setTaskDraft] = useState("");

  const addTask = async () => {
    const title = taskDraft.trim();
    if (!title) return;
    await db.tasks.add({
      title,
      priority: "med",
      status: "pending",
      source: "manual",
      createdAt: Date.now(),
    });
    setTaskDraft("");
  };
  const toggleTask = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    await db.tasks.update(t.id!, {
      status: next,
      completedAt: next === "completed" ? Date.now() : undefined,
    });
  };
  const deleteTask = (id: number) => db.tasks.delete(id);

  // Habits have moved off this screen into their own tab; the ring-row
  // replacement lands in a follow-up step of the habits redesign.

  // --- Header copy ---
  const today = new Date();
  const dayName = today.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = today.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const subtitle =
    !isAuthed       ? "sign in to load calendar" :
    scheduleLoading ? "loading…" :
    scheduleError   ? "calendar error" :
    schedule.length === 0
      ? "nothing on tomorrow's calendar"
      : `${schedule.length} ${schedule.length === 1 ? "event" : "events"} tomorrow`;

  const sectionMeta =
    !isAuthed       ? "" :
    scheduleLoading ? "…" :
    scheduleError   ? "error" :
    `${schedule.length} ${schedule.length === 1 ? "event" : "events"}`;

  const tasksLeft = tasks.filter((t) => t.status !== "completed").length;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        {/* Top */}
        <div className="flex items-end justify-between px-1.5 pb-[18px] pt-3.5">
          <div>
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              {dayName}<br/>{monthDay}
            </h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {subtitle}
            </div>
          </div>
          <div className="text-right font-mono text-xs leading-relaxed tracking-[0.02em] text-subtle">
            {schedule[0] && (
              <>next up<br/><b className="font-medium text-fg">{formatEventTime(schedule[0])}</b></>
            )}
          </div>
        </div>

        {/* Schedule */}
        <Section title="Tomorrow" meta={sectionMeta}>
          <Card>
            {!isAuthed && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Sign in with Google to load your calendar.
              </div>
            )}
            {isAuthed && scheduleLoading && (
              <div className="px-3.5 py-4 text-sm text-muted">Loading events…</div>
            )}
            {isAuthed && !scheduleLoading && scheduleError && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Couldn't load events: {scheduleError}
              </div>
            )}
            {isAuthed && !scheduleLoading && !scheduleError && schedule.length === 0 && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Nothing on tomorrow's calendar.
              </div>
            )}
            {schedule.map((s) => (
              <div key={s.id} className="grid grid-cols-[56px_1fr] border-t border-border px-3.5 py-3 first:border-t-0">
                <div className="pt-px font-mono text-xs tracking-[0.01em] text-muted">
                  {formatEventTime(s)}
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-subtle" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base leading-tight">{s.title}</div>
                    {s.location && <div className="mt-0.5 text-xs text-muted">{s.location}</div>}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        {/* Tasks (resets every Monday) */}
        <Section title="Tasks · this week" meta={`${tasksLeft} left`}>
          <Card>
            {tasks.map((t) => (
              <ListRow
                key={t.id}
                done={t.status === "completed"}
                leading={
                  <button
                    onClick={() => toggleTask(t)}
                    className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
                      t.status === "completed" ? "border-accent bg-accent" : "border-border-strong"
                    }`}
                  >
                    {t.status === "completed" && <CheckIcon />}
                  </button>
                }
                title={t.title}
                sub={t.description}
                trailing={
                  <IconButton label="Delete" onClick={() => deleteTask(t.id!)} className="opacity-50">
                    <XIcon />
                  </IconButton>
                }
              />
            ))}
            <Input
              value={taskDraft}
              onChange={setTaskDraft}
              onSubmit={addTask}
              placeholder="Add a task"
              leading={
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] border-dashed border-border-strong text-subtle">
                  <PlusIcon />
                </span>
              }
            />
          </Card>
        </Section>

        {/* Habits — placeholder while the new HabitRingRow lands in a
            follow-up step of the redesign. Full-featured Habits tab replaces
            the old Goals tab in the next step. */}

        {/* Stats */}
        <Section title="Today's stats">
          <div className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-border bg-surface">
            <StatTile metric="water" onClick={() => onOpenMetric("water")} />
            <StatTile metric="sleep" onClick={() => onOpenMetric("sleep")} />
            <StatTile metric="calories" onClick={() => onOpenMetric("calories")} />
          </div>
        </Section>

        {/* Weekly review */}
        <Section title="Weekly review">
          <WeeklyReviewButton onClick={() => setReviewOpen(true)} />
        </Section>

        {/* Settings */}
        <Section title="Settings">
          <div className="space-y-2">
            <NotificationsRow />
            <BackupRow onClick={onOpenBackup} />
          </div>
        </Section>

        <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </div>
      </div>

      {reviewOpen && (
        <WeeklyReviewSheet onClose={() => setReviewOpen(false)} />
      )}
    </div>
  );
}

function WeeklyReviewButton({ onClick }: { onClick: () => void }) {
  const cached = useLiveQuery(() =>
    db.cached_briefs
      .where("type")
      .equals("weekly")
      .reverse()
      .sortBy("createdAt"),
  );
  const latest = cached?.[0];

  const ago = latest
    ? relativeTime(latest.createdAt)
    : null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg">
        <ScrollIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base leading-tight text-fg">
          {latest ? "Read this week's review" : "Generate this week's review"}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {ago ? `Last generated ${ago}` : "Sonnet 4.6 · last 7 days across the app"}
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ScrollIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 3h7a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 0 1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M2 4.5a1.5 1.5 0 0 1 1.5-1.5v9a1.5 1.5 0 0 0 1.5 1.5h8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5.5 6h4M5.5 8.5h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BackupRow({ onClick }: { onClick: () => void }) {
  // useLiveQuery so the "X days ago" updates as soon as the user copies a
  // backup, without remounting the row.
  const setting = useLiveQuery(() => db.settings.get("lastBackupAt"));
  const ts = setting?.value as number | undefined;

  const now = Date.now();
  const daysAgo =
    ts !== undefined ? Math.floor((now - ts) / 86_400_000) : null;
  const stale = daysAgo !== null && daysAgo >= 14;
  const never = daysAgo === null;

  let metaText: string;
  if (never) {
    metaText = "Never backed up — your data only lives on this device.";
  } else if (daysAgo === 0) {
    metaText = "Last backed up today.";
  } else if (daysAgo === 1) {
    metaText = "Last backed up 1 day ago.";
  } else {
    metaText = `Last backed up ${daysAgo} days ago.`;
  }

  const metaClass = never || stale ? "text-accent-fg" : "text-muted";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-2 text-subtle">
        <BackupIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base leading-tight text-fg">Backup & restore</div>
        <div className={`mt-0.5 font-mono text-[11px] ${metaClass}`}>
          {metaText}
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

function BackupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 3v7M5 7l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 7a4 4 0 0 1 8 0v3l1 2H3l1-2V7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 13a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NotificationsRow() {
  const [state, setState] = useState<NotificationState>({
    kind: isPushSupported() ? "needs-permission" : "unsupported",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh state when this row mounts (and after each enable/disable).
  const refresh = async () => {
    try {
      setState(await getNotificationState());
    } catch {
      // ignore — state stays as-is
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const onTap = async () => {
    if (busy) return;
    setError(null);
    if (state.kind === "unsupported") {
      setError("This browser doesn't support push notifications.");
      return;
    }
    if (state.kind === "denied") {
      setError(
        "Notifications were blocked. Enable them in your device's site settings.",
      );
      return;
    }
    setBusy(true);
    try {
      if (state.kind === "subscribed") {
        if (
          !confirm(
            "Turn off LifeOS notifications? You'll stop getting the daily habit reminder.",
          )
        ) {
          setBusy(false);
          return;
        }
        await disableNotifications();
      } else {
        await enableNotifications();
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sub =
    state.kind === "subscribed"
      ? "On · weight + sleep 9:30 AM · habits 9:30 PM ET"
      : state.kind === "denied"
        ? "Blocked — change in device site settings"
        : state.kind === "unsupported"
          ? "Not supported on this browser"
          : state.kind === "needs-permission"
            ? "Off · tap to enable push reminders"
            : "Off · tap to enable";

  return (
    <div>
      <button
        onClick={onTap}
        disabled={busy}
        className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99] disabled:opacity-60"
      >
        <span
          className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${
            state.kind === "subscribed"
              ? "bg-accent-soft text-accent-fg"
              : "bg-surface-2 text-subtle"
          }`}
        >
          <BellIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-base leading-tight text-fg">Notifications</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {busy ? "…" : sub}
          </div>
        </div>
        <span className="text-subtle">
          {state.kind === "subscribed" ? "On" : "›"}
        </span>
      </button>
      {error && (
        <div className="mt-1 px-3.5 font-mono text-[11px] text-muted">
          {error}
        </div>
      )}
    </div>
  );
}

function StatTile({ metric, onClick }: { metric: DailyMetricType; onClick: () => void }) {
  const today = startOfToday();
  // Calories source comes from logged meal entries (the Macros tab); other
  // metrics read from health_logs.
  const log = useLiveQuery(
    () =>
      metric === "calories"
        ? Promise.resolve(undefined)
        : db.health_logs.where("[date+type]").equals([today, metric]).first(),
    [metric, today],
  );
  const calorieEntries =
    useLiveQuery(
      () =>
        metric === "calories"
          ? db.meal_entries.where("date").equals(today).toArray()
          : Promise.resolve([]),
      [metric, today],
    ) ?? [];
  const value =
    metric === "calories"
      ? calorieEntries.reduce((s, e) => s + e.macros.calories, 0)
      : log?.value ?? 0;
  const goal =
    useLiveQuery(() => getGoal(metric), [metric]) ??
    METRIC_CONFIG[metric].defaultGoal;
  const streak = useLiveQuery(() => computeStreak(metric), [metric]) ?? 0;
  const config = METRIC_CONFIG[metric];
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="flex min-w-0 flex-col gap-1 border-l border-border px-3.5 py-3.5 text-left transition first:border-l-0 hover:bg-surface-2 active:scale-[0.99]"
    >
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-xs uppercase tracking-[0.04em] text-muted">{metric}</div>
        {streak > 0 && (
          <span className={`font-mono text-[10px] ${streak >= 7 ? "text-accent-fg" : "text-muted"}`}>
            {streak}d
          </span>
        )}
      </div>
      <div className="font-mono text-[16.5px] tracking-[-0.01em]">
        {config.format(value)}
        {config.unit && <span className="ml-px text-sm text-muted">{config.unit}</span>}
        <span className="ml-1 text-xs text-subtle">
          {" "}
          / {config.format(goal)}
          {config.unit}
        </span>
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
        <span
          className="block h-full rounded-[inherit] bg-accent transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}


const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
