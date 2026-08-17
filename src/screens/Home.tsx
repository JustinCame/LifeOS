import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section, ListRow, IconButton, Input } from "../components/primitives";
import { db } from "../db";
import type { Task } from "../db/types";
import { listNextDays, formatEventTime, type CalEvent } from "../lib/calendar";
import {
  METRIC_CONFIG,
  computeStreak,
  getGoal,
  startOfToday,
  startOfWeek,
  type DailyMetricType,
} from "../lib/health";
import WeeklyReviewSheet from "../components/WeeklyReviewSheet";
import HabitRingRow from "../components/HabitRingRow";
import DailyPromptCard from "../components/DailyPromptCard";
import InsightCard from "../components/InsightCard";
import InsightsHistorySheet from "../components/InsightsHistorySheet";
import ICalSetupSheet from "../components/ICalSetupSheet";
import ProgramEditorScreen from "./ProgramEditorScreen";
import { markSeen } from "../lib/insights/engine";
import { getICalSources } from "../lib/ical";
import type { InsightSeverity } from "../db/types";
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
  onOpenHabits: () => void;
}

export default function Home({
  onOpenMetric,
  onOpenBackup,
  onOpenHabits,
}: HomeProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [programEditorOpen, setProgramEditorOpen] = useState(false);
  const [insightHistoryOpen, setInsightHistoryOpen] = useState(false);
  const [icalSetupOpen, setIcalSetupOpen] = useState(false);
  // Live-count of configured calendars. Re-reads whenever either the
  // new multi-URL setting or the legacy single-URL setting changes so
  // the Home row label stays in sync.
  const icalCount =
    useLiveQuery(async () => {
      const sources = await getICalSources();
      return sources.length;
    }) ?? 0;
  // Total insights ever generated (minus the Phase 1 demo). Powers the
  // "Insight history · N" row label so the user sees whether there's
  // anything worth opening it for.
  const insightHistoryCount =
    useLiveQuery(async () => {
      const rows = await db.insights.toArray();
      return rows.filter((i) => i.kind !== "phase1_demo").length;
    }) ?? 0;

  // --- Calendar (live, next 7 days starting tomorrow) ---
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
    listNextDays(7)
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

  // Group events by calendar day so the schedule renders as day headings +
  // per-day event rows instead of a flat list where dates repeat.
  const scheduleByDay = (() => {
    const groups = new Map<number, CalEvent[]>();
    for (const e of schedule) {
      const d = new Date(e.start);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  })();

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

  // --- Insights (passive layer, surface: home_top) ---
  // Live-query un-dismissed insights bound to this surface. Sort urgent →
  // notable → info, then by recency. Max 2 render at a time (spec §6).
  const insights =
    useLiveQuery(async () => {
      const rows = await db.insights
        .where("status")
        .anyOf(["new", "seen"])
        .toArray();
      const rank: Record<InsightSeverity, number> = {
        urgent: 2,
        notable: 1,
        info: 0,
      };
      return rows
        .filter((i) => i.surface === "home_top")
        .sort((a, b) => {
          const s = rank[b.severity] - rank[a.severity];
          return s !== 0 ? s : b.createdAt - a.createdAt;
        })
        .slice(0, 2);
    }, []) ?? [];

  // Mark 'new' insights as 'seen' once they've rendered. The dep key changes
  // only when identity or status changes, so this doesn't loop.
  const insightsSignature = insights
    .map((i) => `${i.id}:${i.status}`)
    .join(",");
  useEffect(() => {
    const newIds = insights
      .filter((i) => i.status === "new" && i.id !== undefined)
      .map((i) => i.id!);
    if (newIds.length > 0) void markSeen(newIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsSignature]);

  // --- Header copy ---
  const today = new Date();
  const dayName = today.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = today.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const subtitle =
    !isAuthed       ? "sign in to load calendar" :
    scheduleLoading ? "loading…" :
    scheduleError   ? "calendar error" :
    schedule.length === 0
      ? "nothing on the calendar this week"
      : `${schedule.length} ${schedule.length === 1 ? "event" : "events"} this week`;

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
              <>
                next up<br/>
                <b className="font-medium text-fg">
                  {shortDateLabel(schedule[0].start)} · {formatEventTime(schedule[0])}
                </b>
              </>
            )}
          </div>
        </div>

        {/* Insights (passive layer) — sits above everything else. Cards are
            silent when nothing's worth saying, so this block often renders
            nothing at all. */}
        {insights.length > 0 && (
          <div className="mb-[22px] space-y-2">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        )}

        {/* Schedule */}
        <Section title="Next 7 days" meta={sectionMeta}>
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
                Nothing on the calendar for the next 7 days.
              </div>
            )}
            {scheduleByDay.map(([dayStart, events]) => (
              <div key={dayStart} className="border-t border-border first:border-t-0">
                <div className="flex items-baseline justify-between bg-surface-2/40 px-3.5 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {longDateLabel(dayStart)}
                  </span>
                  <span className="font-mono text-[10px] text-subtle">
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                </div>
                {events.map((s) => (
                  <div
                    key={s.id}
                    className="grid grid-cols-[56px_1fr] border-t border-border px-3.5 py-3"
                  >
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

        <HabitRingRow onOpenHabits={onOpenHabits} />

        {/* Stats */}
        <Section title="Today's stats">
          <div className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-border bg-surface">
            <StatTile metric="water" onClick={() => onOpenMetric("water")} />
            <StatTile metric="sleep" onClick={() => onOpenMetric("sleep")} />
            <StatTile metric="calories" onClick={() => onOpenMetric("calories")} />
          </div>
        </Section>

        <DailyPromptCard />

        {/* Weekly review */}
        <Section title="Weekly review">
          <WeeklyReviewButton onClick={() => setReviewOpen(true)} />
        </Section>

        {/* Settings */}
        <Section title="Settings">
          <div className="space-y-2">
            <NotificationsRow />
            <button
              onClick={() => setIcalSetupOpen(true)}
              className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
            >
              <span
                className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${
                  icalCount > 0
                    ? "bg-accent-soft text-accent-fg"
                    : "bg-surface-2 text-subtle"
                }`}
              >
                <CalendarIconSmall />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Calendars
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {icalCount > 0
                    ? `${icalCount} iCal ${icalCount === 1 ? "URL" : "URLs"} configured — tap to manage`
                    : "Add a Google iCal URL to avoid the 1-hour sign-out"}
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
            <BackupRow onClick={onOpenBackup} />
            <button
              onClick={() => setInsightHistoryOpen(true)}
              className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-2 text-subtle">
                <BulbIcon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Insight history
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {insightHistoryCount > 0
                    ? `${insightHistoryCount} insight${insightHistoryCount === 1 ? "" : "s"} · filter by coach or status`
                    : "Nothing yet — the AI writes into this log as insights fire."}
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
            <button
              onClick={() => setProgramEditorOpen(true)}
              className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-2 text-subtle">
                <DumbbellIcon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">
                  Workout program
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  Edit schedule, exercises, rep ranges, alternatives
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          </div>
        </Section>

        <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </div>

        {/* Build tag — bottom-right of the scroll content. Lets us tell at a
            glance whether the latest deploy has landed on the phone. */}
        <div className="pb-1 text-right font-mono text-[10px] tracking-[0.04em] text-subtle">
          {__BUILD_TIME__} · {__BUILD_COMMIT__}
        </div>
      </div>

      {programEditorOpen && (
        <ProgramEditorScreen onClose={() => setProgramEditorOpen(false)} />
      )}

      {reviewOpen && (
        <WeeklyReviewSheet onClose={() => setReviewOpen(false)} />
      )}

      {insightHistoryOpen && (
        <InsightsHistorySheet onClose={() => setInsightHistoryOpen(false)} />
      )}

      {icalSetupOpen && (
        <ICalSetupSheet onClose={() => setIcalSetupOpen(false)} />
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

function CalendarIconSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="4"
        width="11"
        height="9.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 7h11M5.5 2.5v3M10.5 2.5v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M5 9.5a3.5 3.5 0 1 1 6 0c0 1.2-.7 1.9-1.2 2.5H6.2C5.7 11.4 5 10.7 5 9.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 12.5h3M7 14h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
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
const DumbbellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M3 8v4M5 6v8M7 10h6M13 6v8M15 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

// "Tue" for tomorrow, "Sat" for later this week. Short + relative-feeling.
function shortDateLabel(d: Date | number): string {
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { weekday: "short" });
}

// "Tomorrow · Nov 26" for the next day, "Wed · Nov 28" for later days.
// Gives the schedule per-day headings enough context to plan around.
function longDateLabel(dayStart: number): string {
  const d = new Date(dayStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = today.getTime() + 86_400_000;
  const prefix =
    dayStart === tomorrow
      ? "Tomorrow"
      : d.toLocaleDateString(undefined, { weekday: "short" });
  const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${prefix} · ${md}`;
}
