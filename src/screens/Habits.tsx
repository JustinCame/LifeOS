import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Habit, HabitEntry } from "../db/types";
import {
  consistency,
  entryForToday,
  isScheduledToday,
  progressOf,
  scheduleLabel,
  scheduledHitCounts,
  setHabitValue,
  targetLabel,
} from "../lib/habits";
import DragRing from "../components/DragRing";
import HabitHeatmap from "../components/HabitHeatmap";
import HabitSheet from "../components/HabitSheet";
import HabitDetail from "./HabitDetail";
import GoalsPanel from "./Goals";

type Tab = "habits" | "goals";

export default function Habits() {
  const [view, setView] = useState<Tab>("habits");
  const [sheetHabit, setSheetHabit] = useState<Habit | null>(null);
  const [sheetOpen, setSheetOpen] = useState<"new" | "edit" | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const habits =
    useLiveQuery(() => db.habits.orderBy("createdAt").toArray()) ?? [];
  const activeHabits = useMemo(
    () => habits.filter((h) => !h.archivedAt),
    [habits],
  );
  const goals =
    useLiveQuery(() => db.goals.toArray()) ?? [];
  const activeGoals = goals.filter((g) => g.status !== "completed");
  const completedGoals = goals.filter((g) => g.status === "completed");

  // Sub-line meta on the header changes with the toggle.
  const scheduledToday = activeHabits.filter((h) => isScheduledToday(h));
  const allEntries =
    useLiveQuery(() => db.habit_entries.toArray()) ?? [];
  const entriesByHabit = useMemo(() => {
    const m = new Map<number, HabitEntry[]>();
    for (const e of allEntries) {
      const arr = m.get(e.habitId) ?? [];
      arr.push(e);
      m.set(e.habitId, arr);
    }
    return m;
  }, [allEntries]);

  const doneToday = scheduledToday.filter((h) => {
    const entry = entriesByHabit.get(h.id!)?.find(
      (e) => e.date === startOfToday(),
    );
    return progressOf(h, entry) >= 1;
  }).length;

  const avgConsistency =
    activeHabits.length === 0
      ? 0
      : Math.round(
          activeHabits
            .map((h) => consistency(h, entriesByHabit.get(h.id!) ?? [], 30))
            .reduce((s, v) => s + v, 0) / activeHabits.length,
        );

  const headerSub =
    view === "habits"
      ? `${doneToday}/${scheduledToday.length} today · ${avgConsistency}% this month`
      : `${activeGoals.length} active · ${completedGoals.length} completed`;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            {view === "habits" ? "Habits" : "Goals"}
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {headerSub}
          </div>
        </header>

        {/* Segmented toggle */}
        <div className="mb-3.5 flex gap-1 rounded-full border border-border bg-surface p-1">
          {(["habits", "goals"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${
                view === v
                  ? "bg-accent text-[#0a160d]"
                  : "text-muted hover:text-fg"
              }`}
            >
              {v === "habits" ? "Habits" : "Goals"}
            </button>
          ))}
        </div>

        {view === "habits" ? (
          <>
            {activeHabits.length === 0 && (
              <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
                No habits yet — tap "+ New habit" below to add one.
              </div>
            )}
            {activeHabits.map((h) => (
              <HabitCard
                key={h.id}
                habit={h}
                entries={entriesByHabit.get(h.id!) ?? []}
                onOpenDetail={() => setDetailId(h.id!)}
              />
            ))}

            <button
              onClick={() => {
                setSheetHabit(null);
                setSheetOpen("new");
              }}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
            >
              + New habit
            </button>
            <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
              drag a ring to log · tap the footer for detail
            </div>
          </>
        ) : (
          <GoalsPanel />
        )}
      </div>

      {sheetOpen && (
        <HabitSheet
          habit={sheetOpen === "edit" ? sheetHabit : null}
          onClose={() => {
            setSheetOpen(null);
            setSheetHabit(null);
          }}
        />
      )}
      {detailId !== null && (
        <HabitDetail
          habitId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* -------------------- Habit card -------------------- */

function HabitCard({
  habit,
  entries,
  onOpenDetail,
}: {
  habit: Habit;
  entries: HabitEntry[];
  onOpenDetail: () => void;
}) {
  const scheduled = isScheduledToday(habit);
  const todayEntry = entryForToday(entries);
  const consist = consistency(habit, entries, 30);
  const toggle = habit.kind === "binary" || habit.kind === "avoid";
  const target =
    habit.kind === "binary" || habit.kind === "avoid"
      ? 1
      : habit.target ?? 1;

  // Ring state, lifted local so drag doesn't hammer Dexie.
  const [ringValue, setRingValue] = useState<number | null>(null);
  const persistedValue = todayEntry?.value ?? 0;
  const value = ringValue ?? persistedValue;
  const progress =
    habit.kind === "avoid"
      ? value >= 1
        ? 0
        : 1
      : Math.max(0, Math.min(1, value / target));

  const isBrokenAvoid = habit.kind === "avoid" && value >= 1;

  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-[16px] border bg-surface ${
        scheduled ? "border-border" : "border-border/50"
      }`}
    >
      <div className="flex gap-3.5 px-3.5 pb-3 pt-3.5">
        <div className="flex-shrink-0">
          <DragRing
            size={84}
            stroke={7}
            value={value}
            target={target}
            progress={progress}
            toggle={toggle}
            onChange={setRingValue}
            onCommit={(v) => {
              setHabitValue(habit, v);
              setRingValue(null);
            }}
            arcColor={
              isBrokenAvoid ? "var(--color-subtle)" : undefined
            }
            label={habit.name}
          >
            <CenterReadout habit={habit} value={value} target={target} size={84} />
          </DragRing>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-base leading-tight text-fg">
              {habit.name}
            </div>
            {!scheduled && (
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">
                rest day
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {targetLabel(habit)} · {scheduleLabel(habit)}
          </div>
          <div className="mt-2.5">
            <HabitHeatmap
              habit={habit}
              entries={entries}
              days={30}
              cols={15}
              cell={9}
            />
          </div>
        </div>
      </div>

      <button
        onClick={onOpenDetail}
        className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left hover:bg-surface-2"
      >
        <span
          className={`whitespace-nowrap font-mono text-xs ${
            habit.streak >= 7 ? "text-accent-fg" : "text-muted"
          }`}
        >
          {habit.streak}d streak
        </span>
        <span className="text-subtle">·</span>
        <span className="whitespace-nowrap font-mono text-xs text-muted">
          {consist}%
        </span>
        <span className="text-subtle">·</span>
        <span className="whitespace-nowrap font-mono text-xs text-muted">
          best {habit.longestStreak}d
        </span>
        {isBrokenAvoid ? (
          <span className="ml-auto rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">
            broken today
          </span>
        ) : (
          <span className="ml-auto text-subtle">›</span>
        )}
      </button>
    </div>
  );
}

function CenterReadout({
  habit,
  value,
  target,
  size,
}: {
  habit: Habit;
  value: number;
  target: number;
  size: number;
}) {
  if (habit.kind === "binary") {
    return (
      <div
        className={`font-mono ${value >= 1 ? "text-accent-fg" : "text-subtle"}`}
        style={{ fontSize: size * 0.17 }}
      >
        {value >= 1 ? "done" : "—"}
      </div>
    );
  }
  if (habit.kind === "avoid") {
    return (
      <div
        className={`font-mono ${value >= 1 ? "text-subtle" : "text-accent-fg"}`}
        style={{ fontSize: size * 0.17 }}
      >
        {value >= 1 ? "broken" : "kept"}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <div
        className="font-mono text-fg"
        style={{ fontSize: size * 0.27, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="font-mono text-subtle" style={{ fontSize: size * 0.11 }}>
        / {target}
      </div>
    </div>
  );
}
