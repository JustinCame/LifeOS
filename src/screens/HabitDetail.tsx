import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Habit, HabitEntry } from "../db/types";
import {
  consistency,
  entryForToday,
  kindLabel,
  progressOf,
  scheduleLabel,
  scheduledHitCounts,
  setHabitNote,
  setHabitValue,
  targetLabel,
} from "../lib/habits";
import DragRing from "../components/DragRing";
import HabitHeatmap from "../components/HabitHeatmap";
import HabitSheet from "../components/HabitSheet";
import { Card } from "../components/primitives";

interface Props {
  habitId: number;
  onClose: () => void;
}

const TRANSITION_MS = 260;

export default function HabitDetail({ habitId, onClose }: Props) {
  const habit = useLiveQuery(() => db.habits.get(habitId), [habitId]);
  const entries = useLiveQuery(
    () => db.habit_entries.where("habitId").equals(habitId).toArray(),
    [habitId],
  ) ?? [];

  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const [editOpen, setEditOpen] = useState(false);

  // Local ring value so drag flushes to Dexie in one write on release rather
  // than storming during pointermove.
  const [ringValue, setRingValue] = useState<number | null>(null);

  const [noteDraft, setNoteDraft] = useState("");

  if (!habit) return null;

  const todayEntry = entryForToday(entries);
  const persistedValue = todayEntry?.value ?? 0;
  const value = ringValue ?? persistedValue;
  const target =
    habit.kind === "binary" || habit.kind === "avoid" ? 1 : habit.target ?? 1;
  const progress =
    habit.kind === "avoid"
      ? value >= 1
        ? 0
        : 1
      : Math.max(0, Math.min(1, value / target));

  return (
    <>
      <div
        className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)",
        }}
      >
        <div className="flex-1 overflow-y-auto px-[18px] pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden">
          {/* Nav row */}
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={close}
              className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg"
            >
              <ChevronLeft />
              Habits
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg"
            >
              Edit
            </button>
          </div>

          {/* Header */}
          <header className="px-1.5 pb-4 pt-1">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              {habit.name}
            </h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {kindLabel(habit.kind)} · {targetLabel(habit)} ·{" "}
              {scheduleLabel(habit)}
            </div>
          </header>

          {/* Big ring */}
          <div className="mb-3 flex flex-col items-center rounded-[16px] border border-border bg-surface px-3.5 py-6">
            <DragRing
              size={168}
              stroke={12}
              value={value}
              target={target}
              progress={progress}
              toggle={habit.kind === "binary" || habit.kind === "avoid"}
              onChange={setRingValue}
              onCommit={(v) => {
                setHabitValue(habit, v);
                setRingValue(null);
              }}
              arcColor={
                habit.kind === "avoid" && value >= 1
                  ? "var(--color-subtle)"
                  : undefined
              }
              label={habit.name}
            >
              <BigCenterReadout habit={habit} value={value} target={target} />
            </DragRing>
            <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-subtle">
              {habit.kind === "binary" || habit.kind === "avoid"
                ? "tap to toggle"
                : "drag around the ring to log"}
            </div>
            {(habit.kind === "count" || habit.kind === "duration") && (
              <div className="mt-3 flex gap-2">
                {[-1, 1, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      const next = Math.max(0, Math.min(target, value + d));
                      setHabitValue(habit, next);
                      setRingValue(null);
                    }}
                    className="rounded-[10px] border border-border bg-bg px-3.5 py-1.5 font-mono text-sm text-fg hover:border-border-strong"
                  >
                    {d > 0 ? `+${d}` : `${d}`}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setHabitValue(habit, target);
                    setRingValue(null);
                  }}
                  className="rounded-[10px] bg-accent px-3.5 py-1.5 font-mono text-sm text-[#0a160d]"
                >
                  done
                </button>
              </div>
            )}
          </div>

          {/* Streak grid */}
          <StreakGrid habit={habit} entries={entries} />

          {/* Heatmap */}
          <div className="mt-3 rounded-[16px] border border-border bg-surface px-3.5 py-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-[0.08em] text-muted">
                Last 12 weeks
              </span>
              <span className="font-mono text-[11px] text-subtle">
                {entries.filter((e) => {
                  const p = progressOf(habit, e);
                  return p > 0 && p < 1;
                }).length}{" "}
                partial
              </span>
            </div>
            <HabitHeatmap
              habit={habit}
              entries={entries}
              days={84}
              cols={12}
              cell={11}
            />
            <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-subtle">
              <LegendSwatch
                label="missed"
                style={{ background: "var(--color-surface-2)" }}
              />
              <LegendSwatch
                label="partial"
                style={{
                  background:
                    "color-mix(in oklab, var(--color-accent) 60%, transparent)",
                }}
              />
              <LegendSwatch
                label="hit"
                style={{ background: "var(--color-accent)" }}
              />
              <LegendSwatch
                label="rest"
                style={{
                  background: "transparent",
                  boxShadow: "inset 0 0 0 1px var(--color-border)",
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="mt-3">
            <Card>
              <div className="px-3.5 pb-2 pt-3 text-xs uppercase tracking-[0.06em] text-muted">
                Notes
              </div>
              <NotesList habit={habit} entries={entries} />
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!noteDraft.trim()) return;
                  await setHabitNote(habit, noteDraft);
                  setNoteDraft("");
                }}
                className="flex items-center gap-2 border-t border-border px-3.5 py-2.5"
              >
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note for today"
                  className="flex-1 rounded-[8px] border border-border bg-bg px-2.5 py-1.5 text-sm outline-none placeholder:text-subtle"
                />
                <button
                  type="submit"
                  disabled={!noteDraft.trim()}
                  className={`rounded-[8px] px-3 py-1.5 text-xs font-medium ${
                    noteDraft.trim()
                      ? "bg-accent text-[#0a160d]"
                      : "bg-surface-2 text-subtle"
                  }`}
                >
                  Save
                </button>
              </form>
            </Card>
          </div>
        </div>
      </div>

      {editOpen && (
        <HabitSheet habit={habit} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}

function BigCenterReadout({
  habit,
  value,
  target,
}: {
  habit: Habit;
  value: number;
  target: number;
}) {
  const size = 168;
  if (habit.kind === "binary") {
    const label = value >= 1 ? "done" : "—";
    return (
      <div
        className={`font-mono ${value >= 1 ? "text-accent-fg" : "text-subtle"}`}
        style={{ fontSize: size * 0.17 }}
      >
        {label}
      </div>
    );
  }
  if (habit.kind === "avoid") {
    const label = value >= 1 ? "broken" : "kept";
    return (
      <div
        className={`font-mono ${value >= 1 ? "text-subtle" : "text-accent-fg"}`}
        style={{ fontSize: size * 0.17 }}
      >
        {label}
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
        {habit.unit ? ` ${habit.unit}` : ""}
      </div>
    </div>
  );
}

function StreakGrid({
  habit,
  entries,
}: {
  habit: Habit;
  entries: HabitEntry[];
}) {
  const consist = useMemo(
    () => consistency(habit, entries, 30),
    [habit, entries],
  );
  const { hit, scheduled } = useMemo(
    () => scheduledHitCounts(habit, entries, 30),
    [habit, entries],
  );

  const cells = [
    { label: "current", value: `${habit.streak}d`, accent: habit.streak >= 7 },
    { label: "best", value: `${habit.longestStreak}d`, accent: false },
    { label: "30-day", value: `${consist}%`, accent: consist >= 80 },
    { label: "hit", value: `${hit}/${scheduled}`, accent: false },
  ];

  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-[16px] border border-border bg-surface">
      {cells.map((c) => (
        <div
          key={c.label}
          className="flex flex-col gap-1 border-l border-border px-3 py-3.5 first:border-l-0"
        >
          <span className="text-xs uppercase tracking-[0.04em] text-muted">
            {c.label}
          </span>
          <span
            className={`font-mono text-[16.5px] tracking-[-0.01em] ${
              c.accent ? "text-accent-fg" : "text-fg"
            }`}
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LegendSwatch({
  label,
  style,
}: {
  label: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="flex items-center gap-1">
      <div
        className="rounded-[2px]"
        style={{ width: 8, height: 8, ...style }}
      />
      <span>{label}</span>
    </div>
  );
}

function NotesList({
  entries,
}: {
  habit: Habit;
  entries: HabitEntry[];
}) {
  const withNotes = useMemo(
    () =>
      entries
        .filter((e) => e.note && e.note.trim())
        .sort((a, b) => b.date - a.date),
    [entries],
  );
  if (withNotes.length === 0) {
    return (
      <div className="px-3.5 py-3 text-sm text-muted">
        No notes yet.
      </div>
    );
  }
  return (
    <>
      {withNotes.map((e) => (
        <div
          key={e.id}
          className="border-t border-border px-3.5 py-3 first:border-t-0"
        >
          <div className="font-mono text-[11px] text-subtle">
            {new Date(e.date).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="mt-1 text-base leading-snug text-fg">{e.note}</div>
        </div>
      ))}
    </>
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
