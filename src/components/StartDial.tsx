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
import { useTick } from "../lib/useTick";
import { fireLocalNotification } from "../lib/notifications";
import {
  cancelServiceWorkerNotification,
  scheduleServiceWorkerNotification,
} from "../lib/scheduledNotifications";

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

// Timestamp-based cardio state. Derived from wall-clock via useTick so the
// countdown stays accurate across iOS Safari backgrounding — a decrementing
// counter would freeze the moment the tab loses focus and stay frozen on
// return until the next scheduled tick, which is jarring during a workout.
//
// Field roles:
//   sessionEndsAt  — when the whole session should end. `null` means
//                    frozen (LISS paused, or HIIT between intervals).
//   intervalEndsAt — HIIT only: when the current 90-second interval ends.
//                    `null` between intervals or on LISS.
//   pausedLeft     — seconds remaining in session while frozen. Captured
//                    the moment we pause / end an interval; used to
//                    reconstruct sessionEndsAt on resume.
interface RunState {
  total: number;
  startedAt: number;
  sessionEndsAt: number | null;
  intervalEndsAt: number | null;
  pausedLeft: number | null;
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

  // Wall-clock tick. 500ms is smoother than 1s for the ring animation
  // without meaningful battery cost while the tab is visible; useTick
  // suspends automatically when the tab is hidden.
  const now = useTick(500);

  // Derived countdowns. Frozen state uses pausedLeft; running state
  // derives from the endsAt timestamp.
  const derivedLeft: number = run
    ? run.sessionEndsAt !== null
      ? Math.max(0, Math.ceil((run.sessionEndsAt - now) / 1000))
      : (run.pausedLeft ?? 0)
    : 0;
  const derivedIv: number =
    run && run.intervalEndsAt !== null
      ? Math.max(0, Math.ceil((run.intervalEndsAt - now) / 1000))
      : 0;

  // Auto-end a HIIT interval when it hits 0. Freeze session countdown and
  // wait for the user to tap "Next 90s". Session time not consumed while
  // between intervals — matches the previous decrementing model. Also
  // fires the "interval done" notification + vibration so the user knows
  // to switch modes even if they've backgrounded the app.
  useEffect(() => {
    if (!run) return;
    if (!isHiit) return;
    if (run.intervalEndsAt === null) return;
    if (derivedIv > 0) return;
    const sessionRemaining =
      run.sessionEndsAt !== null
        ? Math.max(0, Math.ceil((run.sessionEndsAt - now) / 1000))
        : (run.pausedLeft ?? 0);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(200); } catch { /* noop */ }
    }
    fireLocalNotification("Interval done", "Rest, then tap for the next.");
    setRun({
      ...run,
      sessionEndsAt: null,
      intervalEndsAt: null,
      pausedLeft: sessionRemaining,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedIv, isHiit]);

  // Schedule SW-driven notifications for the cardio session's boundaries
  // — session end (LISS or HIIT) and each HIIT interval end. These fire
  // even when the app is backgrounded (see scheduledNotifications.ts).
  // The client-side auto-finalize / auto-interval-end effects below are
  // still the fallback and run when the user is in-app.
  useEffect(() => {
    if (!run || run.sessionEndsAt === null) {
      cancelServiceWorkerNotification("cardio-session");
      return;
    }
    scheduleServiceWorkerNotification({
      id: "cardio-session",
      title: "Cardio done",
      body: `${cardio.name} · ${cardio.min} min complete.`,
      at: run.sessionEndsAt,
    });
    return () => cancelServiceWorkerNotification("cardio-session");
  }, [run?.sessionEndsAt, cardio.name, cardio.min]);

  useEffect(() => {
    if (!run || !isHiit || run.intervalEndsAt === null) {
      cancelServiceWorkerNotification("cardio-interval");
      return;
    }
    scheduleServiceWorkerNotification({
      id: "cardio-interval",
      title: "Interval done",
      body: "Rest, then tap for the next.",
      at: run.intervalEndsAt,
    });
    return () => cancelServiceWorkerNotification("cardio-interval");
  }, [run?.intervalEndsAt, isHiit]);

  // Auto-finalize when the total session runs out. Fires the "cardio done"
  // notification + a slightly longer vibration.
  useEffect(() => {
    if (!run) return;
    if (derivedLeft > 0) return;
    const kind: CardioKind = cardio.key;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* noop */ }
    }
    fireLocalNotification(
      "Cardio done",
      `${cardio.name} · ${cardio.min} min complete.`,
    );
    addCardioSession({
      kind,
      durationMin: cardio.min,
      modality: cardio.detail,
    }).catch(() => {});
    setRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedLeft]);

  const R = 86;
  const C = 2 * Math.PI * R;
  const running = isCardio && run !== null;
  const inInterval = running && isHiit && derivedIv > 0;
  // LISS-only concept: paused = session countdown is frozen and it's not
  // a HIIT between-intervals state.
  const paused = running && !isHiit && run!.sessionEndsAt === null;

  const title = running
    ? fmt(derivedLeft)
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
      : paused
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
        ? `${fmt(derivedIv)} in this interval`
        : `${cardio.min} min total`
      : `${cardio.name} · ${cardio.min} min`
    : isCardio
      ? `${cardio.min} min`
      : rest
        ? "Recovery day"
        : `${lift!.exercises} exercises · ~${lift!.min}m`;

  const footer = running
    ? isHiit
      ? `${HIIT_INTERVAL}s intervals · ${Math.ceil(derivedLeft / HIIT_INTERVAL)} left`
      : paused
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
      : paused
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
      ? derivedIv / HIIT_INTERVAL
      : run!.total > 0
        ? derivedLeft / run!.total
        : 0
    : isCardio
      ? Math.min(1, weeklyCardioCount / 3)
      : Math.min(1, weeklyLiftProgress);

  const press = () => {
    if (!isCardio) {
      onStartWorkout(lift);
      return;
    }
    if (!run) {
      // Initial start. Set both endsAts from now. For LISS, no interval.
      const nowMs = Date.now();
      const total = cardio.min * 60;
      setRun({
        total,
        startedAt: nowMs,
        sessionEndsAt: nowMs + total * 1000,
        intervalEndsAt: isHiit ? nowMs + HIIT_INTERVAL * 1000 : null,
        pausedLeft: null,
      });
      return;
    }
    if (isHiit) {
      const nowMs = Date.now();
      if (derivedIv > 0) {
        // End interval early — freeze the session countdown at the current
        // remaining, wait for the user to tap for the next interval.
        setRun({
          ...run,
          sessionEndsAt: null,
          intervalEndsAt: null,
          pausedLeft: derivedLeft,
        });
      } else {
        // Between intervals — start the next. Reconstruct sessionEndsAt
        // from the frozen pausedLeft; cap interval length to avoid the
        // interval outlasting the session on the final rep.
        const remaining = run.pausedLeft ?? 0;
        const intervalLen = Math.min(HIIT_INTERVAL, remaining);
        setRun({
          ...run,
          sessionEndsAt: nowMs + remaining * 1000,
          intervalEndsAt: nowMs + intervalLen * 1000,
          pausedLeft: null,
        });
      }
    } else {
      // LISS pause / resume.
      const nowMs = Date.now();
      const paused = run.sessionEndsAt === null;
      if (paused) {
        const remaining = run.pausedLeft ?? 0;
        setRun({
          ...run,
          sessionEndsAt: nowMs + remaining * 1000,
          pausedLeft: null,
        });
      } else {
        setRun({
          ...run,
          sessionEndsAt: null,
          pausedLeft: derivedLeft,
        });
      }
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
            opacity={
              rest
                ? 0.4
                : running && run!.sessionEndsAt === null
                  ? 0.5
                  : 1
            }
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
