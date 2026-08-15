import { useEffect, useState } from "react";
import type { Habit, HabitKind, HabitSchedule } from "../db/types";
import {
  addHabit,
  archiveHabit,
  defaultScheduleFor,
  deleteHabit,
  unarchiveHabit,
  updateHabit,
} from "../lib/habits";

interface Props {
  // Existing habit to edit, or null for create mode.
  habit: Habit | null;
  onClose: () => void;
}

const TRANSITION_MS = 280;
const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

const KIND_OPTIONS: { key: HabitKind; label: string; hint: string }[] = [
  { key: "binary", label: "Yes / no", hint: "Did I do it today?" },
  { key: "count", label: "Count", hint: "Accumulate toward a target." },
  { key: "duration", label: "Duration", hint: "Minutes toward a target." },
  { key: "avoid", label: "Avoid", hint: "Goal is to keep zero." },
];

export default function HabitSheet({ habit, onClose }: Props) {
  const editing = !!habit;

  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "");
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? "binary");
  const [target, setTarget] = useState(
    habit?.target !== undefined ? String(habit.target) : "",
  );
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [schedule, setSchedule] = useState<HabitSchedule>(
    habit?.schedule ?? { mode: "daily" },
  );

  const [shown, setShown] = useState(false);
  // Guard against iOS ghost-clicks: when the sheet is opened from a button
  // inside another modal (HabitDetail), the click that opened it can
  // re-target onto the newly-mounted overlay and dismiss the sheet. Delay
  // the overlay's clickability past the tap's replay window.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => setInteractive(true), 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsTarget = kind === "count" || kind === "duration";
  const parsedTarget = parseFloat(target);
  const targetValid =
    !needsTarget || (!Number.isNaN(parsedTarget) && parsedTarget > 0);
  const valid = name.trim().length > 0 && targetValid;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const payload = {
      name: name.trim(),
      kind,
      schedule,
      ...(needsTarget ? { target: parsedTarget } : { target: undefined }),
      ...(needsTarget && unit.trim() ? { unit: unit.trim() } : { unit: undefined }),
      // Trim + strip zero-width joiners aren't necessary — Dexie stores the
      // raw string; empty stays empty via undefined.
      emoji: emoji.trim() || undefined,
    };
    if (editing && habit) {
      await updateHabit(habit.id!, payload);
    } else {
      await addHabit(payload);
    }
    close();
  };

  return (
    <>
      <div
        onClick={interactive ? close : undefined}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        } ${interactive ? "" : "pointer-events-none"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {editing ? "Edit habit" : "New habit"}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <form
          onSubmit={save}
          className="flex-1 space-y-4 overflow-y-auto px-[18px] pb-6 pt-2 [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Field
                label="Name"
                value={name}
                onChange={setName}
                placeholder="Read before bed"
                autoFocus
              />
            </div>
            <div className="w-20 flex-shrink-0">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
                  Emoji
                </span>
                <input
                  type="text"
                  value={emoji}
                  maxLength={8}
                  onChange={(e) => setEmoji(e.target.value)}
                  placeholder="📖"
                  className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-center text-lg outline-none placeholder:text-subtle"
                />
              </label>
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted">
            Optional — shown inside the small ring on the Today screen.
          </p>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              Kind
            </div>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={`rounded-[10px] border px-3 py-2 text-left ${
                    kind === k.key
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      kind === k.key ? "text-accent-fg" : "text-fg"
                    }`}
                  >
                    {k.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted">
                    {k.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {needsTarget && (
            <div className="grid grid-cols-2 gap-2">
              <Field
                label={kind === "duration" ? "Target (per day)" : "Target"}
                value={target}
                onChange={setTarget}
                numeric
                placeholder="20"
              />
              <Field
                label="Unit"
                value={unit}
                onChange={setUnit}
                placeholder={kind === "duration" ? "min" : "pages"}
              />
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              Repeats
            </div>
            <div className="mb-2 flex gap-2">
              {(["daily", "weekdays", "perWeek"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSchedule(defaultScheduleFor(m))}
                  className={`flex-1 rounded-[8px] px-2 py-1.5 text-xs font-medium ${
                    schedule.mode === m
                      ? "bg-accent-soft text-accent-fg"
                      : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
                  }`}
                >
                  {m === "daily" ? "Daily" : m === "weekdays" ? "Weekdays" : "Per week"}
                </button>
              ))}
            </div>

            {schedule.mode === "weekdays" && (
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_SHORT.map((d, i) => {
                  const on = schedule.days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? schedule.days.filter((x) => x !== i)
                          : [...schedule.days, i];
                        setSchedule({ mode: "weekdays", days: next });
                      }}
                      className={`grid h-9 place-items-center rounded-[8px] text-xs font-medium ${
                        on
                          ? "bg-accent text-[#0a160d]"
                          : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}

            {schedule.mode === "perWeek" && (
              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                  const on = schedule.perWeek === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setSchedule({ mode: "perWeek", perWeek: n })
                      }
                      className={`grid h-9 place-items-center rounded-[8px] font-mono text-xs font-medium ${
                        on
                          ? "bg-accent text-[#0a160d]"
                          : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!valid}
            className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
              valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
            }`}
          >
            {editing ? "Save changes" : "Create habit"}
          </button>

          {editing && habit && (
            <div className="space-y-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={async () => {
                  if (habit.archivedAt) await unarchiveHabit(habit.id!);
                  else await archiveHabit(habit.id!);
                  close();
                }}
                className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
              >
                {habit.archivedAt ? "Restore from archive" : "Archive habit"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    confirm(
                      `Delete "${habit.name}" and its entire history? This can't be undone.`,
                    )
                  ) {
                    await deleteHabit(habit.id!);
                    close();
                  }
                }}
                className="w-full rounded-[10px] border border-border bg-surface py-2 text-xs text-subtle hover:border-border-strong hover:text-fg"
              >
                Delete habit and history
              </button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        step={numeric ? "any" : undefined}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
      />
    </label>
  );
}
