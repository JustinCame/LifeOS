import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Habit, HabitEntry } from "../db/types";
import {
  isScheduledToday,
  progressOf,
  startOfDay,
} from "../lib/habits";
import { Section } from "./primitives";

interface Props {
  onOpenHabits: () => void;
}

// Compact glance for Today: one small ring per habit scheduled today. No
// habit names — the row is a snapshot, not a list. Tap opens the Habits tab.
export default function HabitRingRow({ onOpenHabits }: Props) {
  const habits =
    useLiveQuery(() => db.habits.toArray()) ?? [];
  const active = useMemo(
    () => habits.filter((h) => !h.archivedAt),
    [habits],
  );
  const scheduled = useMemo(
    () => active.filter((h) => isScheduledToday(h)),
    [active],
  );

  const today = startOfDay();
  const todaysEntries =
    useLiveQuery(
      () => db.habit_entries.where("date").equals(today).toArray(),
      [today],
    ) ?? [];

  const byHabitId = useMemo(() => {
    const m = new Map<number, HabitEntry>();
    for (const e of todaysEntries) m.set(e.habitId, e);
    return m;
  }, [todaysEntries]);

  const doneCount = scheduled.filter(
    (h) => progressOf(h, byHabitId.get(h.id!)) >= 1,
  ).length;

  return (
    <Section
      title="Habits"
      meta={
        scheduled.length > 0
          ? `${doneCount}/${scheduled.length} today`
          : ""
      }
    >
      <button
        onClick={onOpenHabits}
        className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3.5 text-left hover:border-border-strong active:scale-[0.99]"
      >
        <div className="flex flex-1 items-center gap-3">
          {scheduled.length === 0 ? (
            <div className="font-mono text-[11px] text-subtle">
              No habits scheduled today. Tap to add or manage.
            </div>
          ) : (
            scheduled.map((h) => (
              <SmallRing
                key={h.id}
                habit={h}
                entry={byHabitId.get(h.id!)}
              />
            ))
          )}
        </div>
        <span className="text-subtle">›</span>
      </button>
    </Section>
  );
}

function SmallRing({
  habit,
  entry,
}: {
  habit: Habit;
  entry: HabitEntry | undefined;
}) {
  const p = progressOf(habit, entry);
  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arcColor =
    habit.kind === "avoid" && (entry?.value ?? 0) >= 1
      ? "var(--color-subtle)"
      : "var(--color-accent)";
  const dashArray = `${c * p} ${c}`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dashArray}
        />
      </svg>
      {habit.emoji ? (
        // The emoji stays put whether the ring is empty or full — the
        // filling ring around it is the completion signal.
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          style={{ fontSize: 15, lineHeight: 1 }}
        >
          <span>{habit.emoji}</span>
        </div>
      ) : (
        // No emoji: keep the old checkmark on completion so unlabeled habits
        // still have a visible "done" state.
        p >= 1 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 5.5 L4 7.5 L8 3"
                stroke="var(--color-accent-fg)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )
      )}
    </div>
  );
}
