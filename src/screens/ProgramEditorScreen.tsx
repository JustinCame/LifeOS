import { useEffect, useMemo, useState } from "react";
import type { EquipmentType } from "../db/types";
import {
  DOW_SHORT,
  getUserProgramConfig,
  saveUserProgram,
  type CardioSlot,
  type DayPlan,
  type LiftDay,
  type LiftKey,
  type PlanSlot,
  type UserProgramConfig,
} from "../lib/userProgram";

interface Props {
  onClose: () => void;
}

const LIFT_KEYS: LiftKey[] = ["upper", "lower", "push", "pull", "legs"];
const EQUIPMENT_OPTIONS: EquipmentType[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "cardio",
  "other",
];

export default function ProgramEditorScreen({ onClose }: Props) {
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

  // Working copy of the config. Read once on mount so the editor doesn't
  // fight live updates from anywhere else.
  const initial = useMemo(() => getUserProgramConfig(), []);
  const [cfg, setCfg] = useState<UserProgramConfig>(initial);
  const [openLift, setOpenLift] = useState<LiftKey | null>(null);
  const [busy, setBusy] = useState(false);

  const liftByKey = useMemo(() => {
    const m = new Map<LiftKey, LiftDay>();
    for (const l of cfg.lifts) m.set(l.key, l);
    return m;
  }, [cfg]);
  const planByKey = useMemo(() => {
    const m = new Map<LiftKey, DayPlan>();
    for (const d of cfg.program) m.set(d.key, d);
    return m;
  }, [cfg]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveUserProgram(cfg);
      // saveUserProgram reloads — this line rarely runs.
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${
        shown ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
    >
      <div className="flex-1 overflow-y-auto px-[18px] pb-[80px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={close}
            className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg"
          >
            <ChevronLeft />
            Today
          </button>
          <button
            onClick={save}
            disabled={busy}
            className={`rounded-[10px] px-3 py-1.5 text-sm font-medium ${
              busy ? "bg-surface-2 text-subtle" : "bg-accent text-[#0a160d]"
            }`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <header className="px-1.5 pb-3 pt-1">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Workout program
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            Schedule + per-lift exercises. Save reloads the app.
          </div>
        </header>

        {/* Weekly schedule */}
        <section className="mb-[22px]">
          <div className="mx-1.5 mb-2.5 text-xs font-medium uppercase tracking-[0.08em] text-muted">
            Weekly schedule
          </div>
          <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
            {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
              const lift = cfg.lifts.find((l) => l.dow === dow) ?? null;
              const cardio = cfg.cardioSchedule[dow] ?? null;
              return (
                <ScheduleRow
                  key={dow}
                  dow={dow}
                  lift={lift}
                  cardio={cardio}
                  onLiftChange={(newLiftKey) =>
                    setCfg((c) => setLiftDow(c, dow, newLiftKey))
                  }
                  onCardioChange={(newSlot) =>
                    setCfg((c) => ({
                      ...c,
                      cardioSchedule: { ...c.cardioSchedule, [dow]: newSlot },
                    }))
                  }
                />
              );
            })}
          </div>
        </section>

        {/* Per-lift exercises */}
        <section className="mb-[22px]">
          <div className="mx-1.5 mb-2.5 text-xs font-medium uppercase tracking-[0.08em] text-muted">
            Exercises per lift
          </div>
          <div className="space-y-2">
            {LIFT_KEYS.map((key) => {
              const lift = liftByKey.get(key);
              const plan = planByKey.get(key);
              if (!lift || !plan) return null;
              const isOpen = openLift === key;
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-[14px] border border-border bg-surface"
                >
                  <button
                    onClick={() => setOpenLift(isOpen ? null : key)}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">
                        {lift.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted">
                        {plan.slots.length} exercises · ~{lift.min}m ·{" "}
                        {DOW_SHORT[lift.dow]}
                      </div>
                    </div>
                    <span
                      className={`text-subtle transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      ›
                    </span>
                  </button>
                  {isOpen && (
                    <LiftEditor
                      lift={lift}
                      plan={plan}
                      onLiftChange={(patch) =>
                        setCfg((c) => patchLift(c, key, patch))
                      }
                      onPlanChange={(nextPlan) =>
                        setCfg((c) => patchPlan(c, key, nextPlan))
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------- Schedule row -------------------- */

function ScheduleRow({
  dow,
  lift,
  cardio,
  onLiftChange,
  onCardioChange,
}: {
  dow: number;
  lift: LiftDay | null;
  cardio: CardioSlot | null;
  onLiftChange: (nextKey: LiftKey | null) => void;
  onCardioChange: (next: CardioSlot | undefined) => void;
}) {
  const [showCardioMin, setShowCardioMin] = useState(false);

  return (
    <div className="flex items-start gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
      <div className="w-10 flex-shrink-0 pt-2 font-mono text-xs uppercase tracking-[0.06em] text-muted">
        {DOW_SHORT[dow]}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <select
          value={lift?.key ?? ""}
          onChange={(e) =>
            onLiftChange((e.target.value as LiftKey) || null)
          }
          className="w-full rounded-[8px] border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none"
        >
          <option value="">Rest</option>
          {LIFT_KEYS.map((k) => (
            <option key={k} value={k}>
              {k[0].toUpperCase() + k.slice(1)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <select
            value={cardio?.key ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                onCardioChange(undefined);
                setShowCardioMin(false);
                return;
              }
              const kind = v as "liss" | "hiit";
              const defaultMin = kind === "liss" ? 40 : 20;
              const name = kind === "liss" ? "Zone 2" : "HIIT";
              onCardioChange({
                key: kind,
                name,
                min: cardio?.min ?? defaultMin,
                detail: cardio?.detail ?? "",
              });
              setShowCardioMin(true);
            }}
            className="flex-1 rounded-[8px] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none"
          >
            <option value="">No cardio</option>
            <option value="liss">Zone 2</option>
            <option value="hiit">HIIT</option>
          </select>
          {cardio && (
            <>
              <input
                type="number"
                min="1"
                value={cardio.min}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n) || n < 1) return;
                  onCardioChange({ ...cardio, min: n });
                }}
                onFocus={() => setShowCardioMin(true)}
                className="w-14 rounded-[8px] border border-border bg-bg px-2 py-1.5 text-center font-mono text-xs outline-none"
              />
              <span className="font-mono text-[10px] text-subtle">min</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Lift editor -------------------- */

function LiftEditor({
  lift,
  plan,
  onLiftChange,
  onPlanChange,
}: {
  lift: LiftDay;
  plan: DayPlan;
  onLiftChange: (patch: Partial<LiftDay>) => void;
  onPlanChange: (next: DayPlan) => void;
}) {
  return (
    <div className="space-y-3 border-t border-border bg-bg/40 px-3.5 py-3">
      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Duration (min)"
          value={String(lift.min)}
          onChange={(v) => {
            const n = parseInt(v, 10);
            onLiftChange({ min: Number.isNaN(n) ? 60 : n });
          }}
          numeric
        />
        <div className="col-span-2">
          <Field
            label="Sub-title"
            value={lift.sub}
            onChange={(v) => onLiftChange({ sub: v })}
          />
        </div>
      </div>

      <div className="space-y-2">
        {plan.slots.map((slot, i) => (
          <SlotEditor
            key={i}
            slot={slot}
            index={i}
            onChange={(patch) => {
              const next = { ...plan };
              next.slots = plan.slots.slice();
              next.slots[i] = { ...next.slots[i], ...patch };
              onPlanChange(next);
            }}
            onRemove={() => {
              const next = { ...plan };
              next.slots = plan.slots.filter((_, idx) => idx !== i);
              onPlanChange(next);
            }}
            onMoveUp={() => {
              if (i === 0) return;
              const next = { ...plan };
              next.slots = plan.slots.slice();
              [next.slots[i - 1], next.slots[i]] = [
                next.slots[i],
                next.slots[i - 1],
              ];
              onPlanChange(next);
            }}
            onMoveDown={() => {
              if (i === plan.slots.length - 1) return;
              const next = { ...plan };
              next.slots = plan.slots.slice();
              [next.slots[i + 1], next.slots[i]] = [
                next.slots[i],
                next.slots[i + 1],
              ];
              onPlanChange(next);
            }}
            canMoveUp={i > 0}
            canMoveDown={i < plan.slots.length - 1}
          />
        ))}
        <button
          onClick={() => {
            const next = { ...plan };
            next.slots = [
              ...plan.slots,
              {
                name: "New exercise",
                equipment: "barbell",
                muscleGroups: [],
                sets: 3,
                repLow: 8,
                repHigh: 10,
                restSec: 90,
                alternatives: [],
              },
            ];
            onPlanChange(next);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-surface px-3 py-2 text-xs text-accent-fg hover:border-border-strong"
        >
          + Add exercise
        </button>
      </div>
    </div>
  );
}

/* -------------------- Slot editor -------------------- */

function SlotEditor({
  slot,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  slot: PlanSlot;
  index: number;
  onChange: (patch: Partial<PlanSlot>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[10px] border border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-mono text-[11px] text-subtle">{index + 1}</span>
        <input
          type="text"
          value={slot.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-2 py-1 text-sm outline-none"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-[6px] border border-border bg-bg px-2 py-1 text-[10px] text-subtle hover:text-fg"
        >
          {open ? "Hide" : "Edit"}
        </button>
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="grid h-6 w-6 place-items-center rounded-[6px] text-subtle disabled:opacity-25"
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="grid h-6 w-6 place-items-center rounded-[6px] text-subtle disabled:opacity-25"
          aria-label="Move down"
        >
          ↓
        </button>
        <button
          onClick={onRemove}
          className="grid h-6 w-6 place-items-center rounded-[6px] text-subtle opacity-50 hover:opacity-100"
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border bg-bg/40 px-3 py-2.5">
          <div className="grid grid-cols-4 gap-2">
            <Field
              label="Sets"
              value={String(slot.sets)}
              onChange={(v) => {
                const n = parseInt(v, 10);
                onChange({ sets: Number.isNaN(n) ? 1 : n });
              }}
              numeric
            />
            <Field
              label="Rep low"
              value={String(slot.repLow ?? "")}
              onChange={(v) => {
                if (v.trim() === "") return onChange({ repLow: undefined });
                const n = parseInt(v, 10);
                if (!Number.isNaN(n)) onChange({ repLow: n });
              }}
              numeric
            />
            <Field
              label="Rep high"
              value={String(slot.repHigh ?? "")}
              onChange={(v) => {
                if (v.trim() === "") return onChange({ repHigh: undefined });
                const n = parseInt(v, 10);
                if (!Number.isNaN(n)) onChange({ repHigh: n });
              }}
              numeric
            />
            <Field
              label="Rest (s)"
              value={String(slot.restSec)}
              onChange={(v) => {
                const n = parseInt(v, 10);
                onChange({ restSec: Number.isNaN(n) ? 0 : n });
              }}
              numeric
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.06em] text-muted">
              Equipment
            </div>
            <select
              value={slot.equipment}
              onChange={(e) =>
                onChange({ equipment: e.target.value as EquipmentType })
              }
              className="w-full rounded-[8px] border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none"
            >
              {EQUIPMENT_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Muscle groups (comma-separated)"
            value={slot.muscleGroups.join(", ")}
            onChange={(v) =>
              onChange({
                muscleGroups: v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="chest, triceps, shoulders"
          />

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-muted">
              Notes
            </span>
            <textarea
              value={slot.notes ?? ""}
              onChange={(e) =>
                onChange({ notes: e.target.value.trim() || undefined })
              }
              rows={2}
              className="w-full resize-none rounded-[8px] border border-border bg-bg px-2 py-1.5 text-xs outline-none"
            />
          </label>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.06em] text-muted">
              Alternatives (up to 3)
            </div>
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="text"
                  value={slot.alternatives[i] ?? ""}
                  onChange={(e) => {
                    const next = [...slot.alternatives];
                    next[i] = e.target.value;
                    // Strip trailing empties so we don't persist "".
                    while (
                      next.length > 0 &&
                      next[next.length - 1].trim() === ""
                    ) {
                      next.pop();
                    }
                    onChange({ alternatives: next });
                  }}
                  placeholder={`Alternative ${i + 1}`}
                  className="w-full rounded-[6px] border border-border bg-bg px-2 py-1 text-xs outline-none"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Small field helper -------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        step={numeric ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[6px] border border-border bg-bg px-2 py-1 text-sm outline-none placeholder:text-subtle"
      />
    </label>
  );
}

/* -------------------- Config mutation helpers -------------------- */

// Assigning a lift key to a dow: remove any existing entry with that dow,
// remove the previous dow for the picked key (a lift can only sit on one
// day), then add or clear.
function setLiftDow(
  cfg: UserProgramConfig,
  dow: number,
  newKey: LiftKey | null,
): UserProgramConfig {
  let lifts = cfg.lifts.filter((l) => l.dow !== dow);
  if (newKey) {
    // Also strip out the old placement of this key.
    lifts = lifts.filter((l) => l.key !== newKey);
    const existing = cfg.lifts.find((l) => l.key === newKey);
    if (existing) {
      lifts.push({ ...existing, dow });
    } else {
      // Shouldn't happen (all 5 lifts always exist) but fall back gracefully.
      lifts.push({
        key: newKey,
        dow,
        name: newKey[0].toUpperCase() + newKey.slice(1),
        sub: `PPLUL · ${newKey[0].toUpperCase() + newKey.slice(1)}`,
        exercises: 0,
        min: 60,
        templateName: `PPLUL · ${newKey[0].toUpperCase() + newKey.slice(1)}`,
      });
    }
  }
  return { ...cfg, lifts };
}

function patchLift(
  cfg: UserProgramConfig,
  key: LiftKey,
  patch: Partial<LiftDay>,
): UserProgramConfig {
  const lifts = cfg.lifts.map((l) =>
    l.key === key ? { ...l, ...patch } : l,
  );
  return { ...cfg, lifts };
}

function patchPlan(
  cfg: UserProgramConfig,
  key: LiftKey,
  nextPlan: DayPlan,
): UserProgramConfig {
  const program = cfg.program.map((d) => (d.key === key ? nextPlan : d));
  return { ...cfg, program };
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
