// LifeOS — primitives + mock data, mirroring src/components/primitives.tsx
const { useState, useEffect, useRef, useMemo } = React;

// ── primitives (verbatim class strings from the repo) ────────────────
function Section({ title, meta, children }) {
  return (
    <section className="mb-[22px]">
      <div className="mx-1.5 mb-2.5 flex items-baseline justify-between">
        <h3 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted">{title}</h3>
        {meta && <span className="font-mono text-xs tracking-[0.02em] text-subtle">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
function Card({ children }) {
  return <div className="overflow-hidden rounded-[16px] border border-border bg-surface">{children}</div>;
}
function ListRow({ leading, title, sub, trailing, done = false, onClick }) {
  return (
    <div onClick={onClick} className="group flex min-h-[52px] items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0">
      {leading}
      <div className="min-w-0 flex-1">
        <div className={`text-base leading-tight ${done ? "text-subtle line-through" : "text-fg"}`}>{title}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}
function IconButton({ children, onClick, label, className = "" }) {
  return (
    <button onClick={onClick} aria-label={label} className={`grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg ${className}`}>
      {children}
    </button>
  );
}
function Input({ value, onChange, placeholder, onSubmit, leading }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit && onSubmit(); }} className="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5">
      {leading}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent text-base outline-none placeholder:text-subtle" />
    </form>
  );
}
function ArrowUp() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function ChatDock({ onOpen, placeholder = "Ask Claude…" }) {
  return (
    <div className="absolute inset-x-0 bottom-[64px] z-20 border-t border-border bg-bg/80 px-3.5 pb-3 pt-2.5 backdrop-blur-xl backdrop-saturate-150">
      <div onClick={onOpen} role="button" className="flex h-11 cursor-text items-center gap-2.5 rounded-full border border-border bg-surface pl-4 pr-1.5 hover:border-border-strong">
        <span className="flex-1 truncate text-base text-subtle">{placeholder}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-subtle"><ArrowUp /></span>
      </div>
    </div>
  );
}

// ── shared icons ─────────────────────────────────────────────────────
const CheckIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const XIcon = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const PlusIcon = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const PlusIcon14 = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
const PlusInCircle = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
const ChevronLeft = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L4 7l5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ChevronRight = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ScrollIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 3h7a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 0 1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 4.5a1.5 1.5 0 0 1 1.5-1.5v9a1.5 1.5 0 0 0 1.5 1.5h8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5.5 6h4M5.5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const BackupIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 3v7M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const BellIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 7a4 4 0 0 1 8 0v3l1 2H3l1-2V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;

// ── date helpers ─────────────────────────────────────────────────────
const DAY = 86400000;
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function sameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase(); }
function startOfWeekMon(d = new Date()) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r.getTime();
}
function relativeTime(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── seeded mock data (stands in for Dexie + Google Calendar) ─────────
const T = startOfToday();
function at(dayOffset, h, m) { const d = new Date(T + dayOffset * DAY); d.setHours(h, m, 0, 0); return d; }

const MOCK = {
  events: [
    { id: "e1", title: "Standup with Maya", start: at(1, 9, 30), location: "Google Meet" },
    { id: "e2", title: "Design review", start: at(1, 11, 0), location: "Zoom" },
    { id: "e3", title: "Dentist — Dr. Park", start: at(1, 14, 0), location: "Westside Dental" },
    { id: "e4", title: "Dinner — Caro & Sam", start: at(1, 19, 30), location: "Tabu, Mission St" },
    { id: "e5", title: "Lift — Push day", start: at(0, 7, 0), location: "Equinox" },
    { id: "e6", title: "1:1 with Devi", start: at(0, 15, 0), location: "" },
    { id: "e7", title: "Flight to Austin", start: at(3, 6, 45), location: "SFO T2", recurringEventId: null },
    { id: "e8", title: "Weekly review", start: at(5, 17, 0), location: "", recurringEventId: "r1" },
    { id: "e9", title: "Climbing", start: at(-2, 18, 0), location: "Dogpatch" },
  ],
  tasks: [
    { id: 1, title: "File Q2 expenses", status: "pending" },
    { id: 2, title: "Reply to Devi re: lease renewal", status: "pending" },
    { id: 3, title: "Renew passport", description: "Rush option — submit by Friday", status: "pending" },
    { id: 4, title: "Defrost salmon", status: "completed" },
    { id: 5, title: "Book flights for Austin", status: "completed" },
  ],
  habits: [
    { id: 1, name: "Read 20 pages", streak: 12, history: [1,1,1,1,1,1,1] },
    { id: 2, name: "Meditate", streak: 7, history: [1,1,1,1,1,1,0] },
    { id: 3, name: "Stretch", streak: 3, history: [0,0,1,0,1,1,1] },
    { id: 4, name: "No phone in bed", streak: 21, history: [1,1,1,1,1,1,0] },
  ],
  metrics: { water: 2.5, sleep: 7.5, calories: 1820 },
  goalsMeta: { water: 3.785, sleep: 7, calories: 2200 },
  streaks: { water: 4, sleep: 9, calories: 2 },
  goals: [
    { id: 1, title: "Bench 225 for 5", term: "mid", description: "Currently 205×5", targetDate: T + 90*DAY, status: "active" },
    { id: 2, title: "Ship LifeOS v1 to TestFlight", term: "short", description: "PWA first, native later", targetDate: T + 21*DAY, status: "active" },
    { id: 3, title: "Read 24 books this year", term: "long", description: "9 down", targetDate: null, status: "active" },
    { id: 4, title: "Run a sub-25 5K", term: "mid", description: "", targetDate: T + 120*DAY, status: "active" },
    { id: 5, title: "Cut to 175 lb", term: "short", description: "Down 6 lb so far", targetDate: null, status: "completed" },
  ],
  notes: [
    { id: 1, title: "LifeOS — v2 ideas", body: "Widget for today's macros\nSiri shortcut for water", updatedAt: Date.now() - 40*60000 },
    { id: 2, title: "Austin trip", body: "Franklin BBQ reservation Thu 11am", updatedAt: Date.now() - 5*3600000 },
    { id: 3, title: "Lease renewal questions", body: "Ask about parking spot + pet deposit", updatedAt: Date.now() - 2*DAY },
    { id: 4, title: "Books to buy", body: "The Dawn of Everything", updatedAt: Date.now() - 9*DAY },
  ],
  workouts: [
    { id: 1, name: "Push A", date: T - 1*DAY, exercises: 6, sets: 21, volume: 24380, reps: 96, durationSec: 3720, prs: 2, groups: ["chest","triceps","shoulders"] },
    { id: 2, name: "Pull A", date: T - 3*DAY, exercises: 5, sets: 18, volume: 21150, reps: 88, durationSec: 3300, prs: 0, groups: ["back","biceps"] },
    { id: 3, name: "Legs", date: T - 5*DAY, exercises: 6, sets: 22, volume: 31200, reps: 74, durationSec: 4020, prs: 1, groups: ["quads","hamstrings","glutes"] },
    { id: 4, name: "Upper", date: T - 8*DAY, exercises: 7, sets: 14, volume: 19870, reps: 102, durationSec: 3480, prs: 0, groups: ["chest","back","shoulders"] },
    { id: 5, name: "Pull B", date: T - 10*DAY, exercises: 5, sets: 8, volume: 16400, reps: 70, durationSec: 2700, prs: 0, groups: ["back","biceps"] },
    { id: 6, name: "Legs", date: T - 12*DAY, exercises: 6, sets: 19, volume: 29800, reps: 68, durationSec: 3900, prs: 0, groups: ["quads","glutes"] },
    { id: 7, name: "Push B", date: T - 15*DAY, exercises: 6, sets: 17, volume: 23100, reps: 92, durationSec: 3600, prs: 1, groups: ["chest","shoulders"] },
    { id: 8, name: "Upper", date: T - 18*DAY, exercises: 7, sets: 5, volume: 9200, reps: 40, durationSec: 1800, prs: 0, groups: ["chest","back"] },
    { id: 9, name: "Legs", date: T - 22*DAY, exercises: 6, sets: 20, volume: 30500, reps: 72, durationSec: 3960, prs: 0, groups: ["quads","hamstrings"] },
    { id: 10, name: "Pull A", date: T - 26*DAY, exercises: 5, sets: 16, volume: 20800, reps: 86, durationSec: 3240, prs: 0, groups: ["back","biceps"] },
    { id: 11, name: "Push A", date: T - 31*DAY, exercises: 6, sets: 12, volume: 22400, reps: 90, durationSec: 3480, prs: 0, groups: ["chest","triceps"] },
    { id: 12, name: "Legs", date: T - 38*DAY, exercises: 6, sets: 18, volume: 28900, reps: 66, durationSec: 3840, prs: 0, groups: ["quads","glutes"] },
    { id: 13, name: "Upper", date: T - 45*DAY, exercises: 7, sets: 15, volume: 18900, reps: 98, durationSec: 3360, prs: 0, groups: ["chest","back"] },
    { id: 14, name: "Pull B", date: T - 52*DAY, exercises: 5, sets: 4, volume: 8100, reps: 34, durationSec: 1620, prs: 0, groups: ["back"] },
    { id: 15, name: "Push B", date: T - 60*DAY, exercises: 6, sets: 17, volume: 21900, reps: 88, durationSec: 3540, prs: 0, groups: ["chest","shoulders"] },
    { id: 16, name: "Legs", date: T - 67*DAY, exercises: 6, sets: 21, volume: 30100, reps: 70, durationSec: 3900, prs: 0, groups: ["quads","hamstrings"] },
    { id: 17, name: "Upper", date: T - 74*DAY, exercises: 7, sets: 13, volume: 19200, reps: 96, durationSec: 3300, prs: 0, groups: ["chest","back"] },
    { id: 18, name: "Pull A", date: T - 81*DAY, exercises: 5, sets: 7, volume: 15600, reps: 66, durationSec: 2580, prs: 0, groups: ["back","biceps"] },
  ],
  templates: [
    { id: 1, name: "PPLUL · Push", exercises: 6, useCount: 12 },
    { id: 2, name: "PPLUL · Pull", exercises: 5, useCount: 11 },
    { id: 3, name: "PPLUL · Legs", exercises: 6, useCount: 9 },
    { id: 4, name: "PPLUL · Upper", exercises: 7, useCount: 7 },
    { id: 5, name: "PPLUL · Lower", exercises: 6, useCount: 7 },
  ],
  cardio: [
    { id: 1, kind: "liss", modality: "Incline walk", date: T - 1*DAY, durationMin: 40, notes: "Zone 2" },
    { id: 2, kind: "hiit", modality: "Bike sprints", date: T - 3*DAY, durationMin: 18, notes: "" },
    { id: 3, kind: "liss", modality: "Rower", date: T - 6*DAY, durationMin: 35, notes: "" },
  ],
  meals: {
    breakfast: [
      { id: 1, foodName: "Greek yogurt, plain", servings: 1.5, macros: { calories: 220, carbs: 12, protein: 33, fat: 3 } },
      { id: 2, foodName: "Blueberries", servings: 1, macros: { calories: 85, carbs: 21, protein: 1, fat: 0 } },
    ],
    lunch: [
      { id: 3, foodName: "Chicken burrito bowl", servings: 1, macros: { calories: 720, carbs: 68, protein: 54, fat: 24 } },
    ],
    dinner: [],
    snack: [
      { id: 4, foodName: "Protein bar", servings: 1, macros: { calories: 210, carbs: 22, protein: 20, fat: 7 } },
      { id: 5, foodName: "Almonds", servings: 0.5, macros: { calories: 145, carbs: 5, protein: 5, fat: 13 } },
    ],
  },
  macroGoals: { calories: 2200, protein: 150, carbs: 250, fat: 70 },
  weights: (() => {
    const out = []; let w = 186;
    for (let i = 119; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      w -= 0.09 + Math.sin(i / 4) * 0.26;
      if (i % 11 === 5 || i % 17 === 3) continue; // missed weigh-ins
      out.push({ date: d.getTime(), value: Math.round(w * 10) / 10 });
    }
    return out;
  })(),
  sleepLogs: Array.from({ length: 14 }, (_, i) => ({ date: T - (13 - i) * DAY, value: [6.5,7,8,7.5,6,7.5,8.5,7,6.5,7.5,8,7,7.5,7.5][i] })),
  waterLogs: Array.from({ length: 14 }, (_, i) => ({ date: T - (13 - i) * DAY, value: [3.8,2.5,4,3.2,2,3.8,4.2,3.5,2.8,3.8,4,3.2,3.5,2.5][i] })),
  foodCount: 87,
  recipeCount: 14,
};

const COACHES = {
  home:    { label: "Alfred", placeholder: "Ask Alfred…" },
  fitness: { label: "Jarvis · Fitness coach", placeholder: "Ask your fitness coach Jarvis…" },
  macros:  { label: "Sebastian · Nutrition coach", placeholder: "Ask your nutrition coach Sebastian…" },
  goals:   { label: "Benson · Goals coach", placeholder: "Ask your goals coach Benson…" },
  health:  { label: "Cornelius · Health coach", placeholder: "Ask your health coach Cornelius…" },
};

const METRIC_CONFIG = {
  water:    { unit: "L", format: (v) => v.toFixed(2) },
  sleep:    { unit: "h", format: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) },
  calories: { unit: "",  format: (v) => Math.round(v).toLocaleString() },
};

Object.assign(window, {
  Section, Card, ListRow, IconButton, Input, ChatDock, ArrowUp,
  CheckIcon, XIcon, PlusIcon, PlusIcon14, PlusInCircle, ChevronLeft, ChevronRight,
  ScrollIcon, BackupIcon, BellIcon,
  DAY, T, startOfToday, startOfWeekMon, sameDay, fmtTime, relativeTime,
  MOCK, COACHES, METRIC_CONFIG,
});
