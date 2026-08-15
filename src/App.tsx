import { useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { syncAllLinkedHabits } from "./lib/linkedHabits";
import Home from "./screens/Home";
import Calendar from "./screens/Calendar";
import Fitness from "./screens/Fitness";
import Macros from "./screens/Macros";
import Health from "./screens/Health";
import Habits from "./screens/Habits";
import Notes from "./screens/Notes";
import Chat from "./screens/Chat";
import { ChatDock } from "./components/primitives";
import { GoogleAuthButton } from "./components/GoogleAuthButton";
import MetricSheet from "./components/MetricSheet";
import BackupSheet from "./components/BackupSheet";
import type { DailyMetricType } from "./lib/health";
import { COACH_CONFIG, type CoachKey } from "./lib/coaches";

const THEME_KEY = "lifeos:theme";
type Tab = "home" | "calendar" | "fitness" | "macros" | "health" | "habits" | "notes";

function tabToCoachKey(tab: Tab): CoachKey {
  switch (tab) {
    case "fitness": return "fitness";
    case "macros": return "macros";
    case "health": return "health";
    // Habits shares Benson (the "goals" coach) since goals live on the same
    // screen as a toggle.
    case "habits": return "goals";
    // notes shares the Today coach until it gets its own butler
    default: return "home";
  }
}

function getTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function subscribeTheme(cb: () => void) {
  const handler = (e: StorageEvent) => { if (e.key === THEME_KEY) cb(); };
  window.addEventListener("storage", handler);
  document.addEventListener("lifeos:theme", cb);
  return () => {
    window.removeEventListener("storage", handler);
    document.removeEventListener("lifeos:theme", cb);
  };
}
function toggleTheme() {
  const next = getTheme() === "light" ? "dark" : "light";
  if (next === "light") {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem(THEME_KEY, "light");
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  }
  document.dispatchEvent(new Event("lifeos:theme"));
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [chatOpen, setChatOpen] = useState(false);
  const [metricSheet, setMetricSheet] = useState<DailyMetricType | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);

  useLinkedHabitSync();

  // Shared handler so Home and Health both open the same MetricSheet for
  // sleep/water — calories still bounce over to the Macros tab.
  const openMetric = (m: DailyMetricType) => {
    if (m === "calories") setTab("macros");
    else setMetricSheet(m);
  };

  const openBackup = () => setBackupOpen(true);

  return (
    <main className="relative mx-auto h-dvh max-w-[640px] overflow-hidden bg-bg">
      {tab === "home" ? (
        <Home
          onOpenMetric={openMetric}
          onOpenBackup={openBackup}
          onOpenHabits={() => setTab("habits")}
        />
      ) : tab === "calendar" ? (
        <Calendar />
      ) : tab === "fitness" ? (
        <Fitness />
      ) : tab === "macros" ? (
        <Macros />
      ) : tab === "health" ? (
        <Health onOpenMetric={openMetric} />
      ) : tab === "habits" ? (
        <Habits />
      ) : (
        <Notes />
      )}

      <ChatDock
        onOpen={() => setChatOpen(true)}
        placeholder={COACH_CONFIG[tabToCoachKey(tab)].placeholder}
      />
      {chatOpen && (
        <Chat
          onClose={() => setChatOpen(false)}
          coachKey={tabToCoachKey(tab)}
        />
      )}
      {metricSheet && (
        <MetricSheet
          type={metricSheet}
          onClose={() => setMetricSheet(null)}
        />
      )}
      {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}

      <TabBar value={tab} onChange={setTab} />

      <GoogleAuthButton />
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface/70 text-subtle backdrop-blur hover:border-border-strong hover:text-fg"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </main>
  );
}

// Watches today's water/sleep logs and today's workouts. Whenever any of
// them change, re-runs the linked-habit sync so rings on the Today screen
// reflect the external source of truth without the user having to toggle
// anything. Only imports the sync from lib/linkedHabits.
function useLinkedHabitSync() {
  const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const waterLog = useLiveQuery(
    () =>
      db.health_logs.where("[date+type]").equals([today, "water"]).first(),
    [today],
  );
  const sleepLog = useLiveQuery(
    () =>
      db.health_logs.where("[date+type]").equals([today, "sleep"]).first(),
    [today],
  );
  const todayWorkoutsDone = useLiveQuery(
    () =>
      db.workouts
        .where("date")
        .aboveOrEqual(today)
        .filter((w) => w.completedAt !== undefined && w.completedAt >= today)
        .count(),
    [today],
  );
  // Habits set includes archivedAt so the effect re-runs when a habit's
  // linkedMetric changes (via HabitSheet save → habit table update).
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? [];

  useEffect(() => {
    syncAllLinkedHabits().catch(() => {
      // Ignore: transient migration / read errors clear on next tick.
    });
  }, [
    waterLog?.value,
    sleepLog?.value,
    todayWorkoutsDone,
    habits.map((h) => `${h.id}:${h.linkedMetric ?? ""}`).join(","),
  ]);
}

function TabBar({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-bg/95 backdrop-blur-xl">
      <TabButton
        active={value === "home"}
        onClick={() => onChange("home")}
        icon={<HomeIcon />}
        label="Today"
      />
      <TabButton
        active={value === "calendar"}
        onClick={() => onChange("calendar")}
        icon={<CalendarIcon />}
        label="Calendar"
      />
      <TabButton
        active={value === "fitness"}
        onClick={() => onChange("fitness")}
        icon={<DumbbellIcon />}
        label="Fitness"
      />
      <TabButton
        active={value === "macros"}
        onClick={() => onChange("macros")}
        icon={<MacrosIcon />}
        label="Macros"
      />
      <TabButton
        active={value === "health"}
        onClick={() => onChange("health")}
        icon={<HeartIcon />}
        label="Health"
      />
      <TabButton
        active={value === "habits"}
        onClick={() => onChange("habits")}
        icon={<HabitIcon />}
        label="Habits"
      />
      <TabButton
        active={value === "notes"}
        onClick={() => onChange("notes")}
        icon={<NoteIcon />}
        label="Notes"
      />
    </div>
  );
}

function TabButton({
  active, icon, label, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition ${
        active ? "text-fg" : "text-subtle hover:text-fg"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</span>
    </button>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 8.5L10 3l7 5.5V16a1.5 1.5 0 0 1-1.5 1.5h-3v-5h-5v5h-3A1.5 1.5 0 0 1 3 16V8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function DumbbellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 8v4M5 6v8M7 10h6M13 6v8M15 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function MacrosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 9h12c0 3.3-2.7 6-6 6s-6-2.7-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 5.5c1 .8 1 2.2 0 3M10 4.5c1 .8 1 2.2 0 3M13 5.5c1 .8 1 2.2 0 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function HabitIcon() {
  // Ring with a partial arc — reads as "progress toward completion" and
  // echoes the drag rings on the Habits screen.
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
      <path d="M10 3.5a6.5 6.5 0 0 1 5.6 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 16.5s-5.5-3.4-5.5-7.7A3.3 3.3 0 0 1 10 6.3a3.3 3.3 0 0 1 5.5 2.5c0 4.3-5.5 7.7-5.5 7.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect
        x="4"
        y="3"
        width="12"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 7h6M7 10h6M7 13h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1l1.1-1.1M10 4l1.1-1.1" />
      </g>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 8.6A4.6 4.6 0 0 1 5.4 2.5 4.8 4.8 0 1 0 11.5 8.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
