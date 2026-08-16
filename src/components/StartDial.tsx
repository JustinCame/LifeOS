import { useEffect, useRef, useState } from "react";
import type { CardioKind } from "../db/types";
import { addCardioSession } from "../lib/cardio";
import {
  CARDIO_OPTS,
  DOW_SHORT,
  LIFTS,
  type CardioSlot,
  type LiftDay,
  todaysCardio,
  todaysLift,
} from "../lib/userProgram";

interface Props {
  hasActiveWorkout: boolean;
  weeklyLiftProgress: number;   // 0..1
  weeklyCardioCount: number;    // for cardio idle-ring progress vs target 3
  onStartWorkout: (lift: LiftDay | null) => void;
}

const HIIT_INTERVAL = 90;

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface RunState {
  total: number;
  left: number;
  iv: number;          // seconds left in current HIIT interval; 0 = between-intervals
  paused: boolean;
  startedAt: number;
}

export default function StartDial({
  hasActiveWorkout,
  weeklyLiftProgress,
  weeklyCardioCount,
  onStartWorkout,
}: Props) {
  const today = todaysLift();
  const scheduledCardio = todaysCardio();

  // Default mode: workout if today has a lift, else cardio (if scheduled),
  // else workout with a "Rest" state. Kept in local state so the user can flip.
  const [mode, setMode] = useState<"workout" | "cardio">(
    today ? "workout" : "cardio",
  );
  // Swapped lift picker index (null = follow today's schedule).
  const [liftIdx, setLiftIdx] = useState<number | null>(null);
  // Cardio option index; seeded with today's scheduled cardio if any.
  const [cardioIdx, setCardioIdx] = useState(() => {
    if (!scheduledCardio) return 0;
    const i = CARDIO_OPTS.findIndex((c) => c.key === scheduledCardio.key);
    return i >= 0 ? i : 0;
  });

  const [run, setRun] = useState<RunState | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    // Kill any in-flight timer on mode / cardio-type switch.
    setRun(null);
  }, [mode, cardioIdx]);

  const isCardio = mode === "cardio";
  const cardio = CARDIO_OPTS[cardioIdx];
  const isHiit = isCardio && cardio.key === "hiit";
  const lift = liftIdx === null ? today : LIFTS[liftIdx];
  const rest = !isCardio && !lift;
  const swapped = liftIdx !== null;

  const ticking = run !== null && (isHiit ? run.iv > 0 : !run.paused);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      setRun((r) => {
        if (!r) return r;
        if (r.left <= 1) return { ...r, left: 0, iv: 0 };
        const iv = isHiit ? Math.max(0, r.iv - 1) : r.iv;
        return { ...r, left: r.left - 1, iv };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [ticking, isHiit]);

  // Auto-finalize a cardio session once its total hits zero.
  useEffect(() => {
    if (!run) return;
    if (run.left > 0) return;
    // Finalize.
    const kind: CardioKind = cardio.key;
    addCardioSession({
      kind,
      durationMin: cardio.min,
      modality: cardio.detail,
    }).catch(() => {});
    setRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.left]);

  const R = 86;
  const C = 2 * Math.PI * R;
  const running = isCardio && run !== null;
  const inInterval = running && isHiit && run.iv > 0;

  const title = running
    ? fmt(run.left)
    : isCardio
      ? cardio.name
      : rest
        ? "Rest"
        : lift!.name;

  const kicker = running
    ? isHiit
      ? inInterval
        ? "Interval"
        : "Rest — tap for next"
      : run!.paused
        ? "Paused"
        : "In progress"
    : isCardio
      ? "Cardio"
      : swapped
        ? DOW_SHORT[lift!.dow]
        : "Today";

  const meta = running
    ? isHiit
      ? inInterval
        ? `${fmt(run!.iv)} in this interval`
        : `${cardio.min} min total`
      : `${cardio.name} · ${cardio.min} min`
    : isCardio
      ? `${cardio.min} min`
      : rest
        ? "Recovery day"
        : `${lift!.exercises} exercises · ~${lift!.min}m`;

  const footer = running
    ? isHiit
      ? `${HIIT_INTERVAL}s intervals · ${Math.ceil(run!.left / HIIT_INTERVAL)} left`
      : run!.paused
        ? "paused"
        : "tap the circle to pause"
    : isCardio
      ? cardio.detail
      : rest
        ? scheduledCardio
          ? "no lift scheduled · cardio recommended"
          : "no lift scheduled"
        : lift!.sub;

  const action = running
    ? isHiit
      ? inInterval
        ? "End interval"
        : "Next 90s"
      : run!.paused
        ? "Resume"
        : "Pause"
    : isCardio
      ? "Start"
      : rest
        ? "Log anyway"
        : hasActiveWorkout
          ? "Resume"
          : "Start";

  // Ring progress: cardio countdown while running, else weekly progress.
  const ringPct = running
    ? isHiit
      ? (run!.iv || 0) / HIIT_INTERVAL
      : run!.left / run!.total
    : isCardio
      ? Math.min(1, weeklyCardioCount / 3)
      : Math.min(1, weeklyLiftProgress);

  const press = () => {
    if (!isCardio) {
      onStartWorkout(lift);
      return;
    }
    if (!run) {
      const total = cardio.min * 60;
      setRun({
        total,
        left: total,
        iv: isHiit ? HIIT_INTERVAL : 0,
        paused: false,
        startedAt: Date.now(),
      });
      return;
    }
    if (isHiit) {
      // Between intervals: start the next; during interval: end it early.
      const nextIv = run.iv > 0 ? 0 : Math.min(HIIT_INTERVAL, run.left);
      setRun({ ...run, iv: nextIv });
    } else {
      setRun({ ...run, paused: !run.paused });
    }
  };

  const swapAction = () => {
    if (running) {
      setRun(null);
      return;
    }
    if (swapped && !isCardio) {
      setLiftIdx(null);
      return;
    }
    if (isCardio) {
      setCardioIdx((i) => (i + 1) % CARDIO_OPTS.length);
    } else {
      setLiftIdx((i) => (i === null ? 0 : (i + 1) % LIFTS.length));
    }
  };

  const swapLabel = running
    ? "cancel"
    : swapped && !isCardio
      ? "back to today"
      : isCardio
        ? "switch type"
        : "swap day";

  return (
    <div className="mb-4 flex flex-col items-center">
      <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface p-1">
        {(["workout", "cardio"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`rounded-full px-3 py-1 text-xs ${
              mode === k
                ? "bg-surface-2 text-fg"
                : "text-subtle hover:text-fg"
            }`}
          >
            {k === "workout" ? "Workout" : "Cardio"}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg width="204" height="204" viewBox="0 0 204 204" className="block">
          <circle
            cx="102"
            cy="102"
            r={R}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth="10"
          />
          <circle
            cx="102"
            cy="102"
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C * ringPct} ${C}`}
            transform="rotate(-90 102 102)"
            opacity={rest ? 0.4 : running && !ticking ? 0.5 : 1}
            style={{ transition: "stroke-dasharray 0.9s linear" }}
          />
        </svg>
        <button
          onClick={press}
          className={`absolute inset-[22px] flex flex-col items-center justify-center gap-1 rounded-full transition active:scale-[0.97] ${
            rest
              ? "border border-border bg-surface text-fg"
              : "bg-accent text-[#0a160d]"
          }`}
        >
          <span
            className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] ${
              rest ? "text-muted" : "text-[#0a160d]/60"
            }`}
          >
            {kicker}
          </span>
          <span
            className="font-medium leading-none tracking-[-0.02em]"
            style={{ fontSize: running ? 34 : 26 }}
          >
            {title}
          </span>
          <span
            className={`whitespace-nowrap font-mono text-[11px] ${
              rest ? "text-subtle" : "text-[#0a160d]/70"
            }`}
          >
            {meta}
          </span>
          <span
            className={`mt-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${
              rest
                ? "border border-border text-subtle"
                : "bg-[#0a160d]/12 text-[#0a160d]"
            }`}
          >
            {action}
          </span>
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-subtle">
        <span>{footer}</span>
        <span>·</span>
        <button
          onClick={swapAction}
          className="text-accent-fg hover:underline"
        >
          {swapLabel}
        </button>
      </div>
    </div>
  );
}

// Re-export the type here so Fitness.tsx doesn't have to reach into
// lib/userProgram twice.
export type { CardioSlot };
