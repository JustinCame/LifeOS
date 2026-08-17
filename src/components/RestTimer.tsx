import { useEffect, useRef, useState } from "react";
import { fireLocalNotification } from "../lib/notifications";
import {
  cancelServiceWorkerNotification,
  scheduleServiceWorkerNotification,
} from "../lib/scheduledNotifications";
import { useTick } from "../lib/useTick";

interface Props {
  // Prescribed rest for the just-completed set, in seconds.
  initialSeconds: number;
  exerciseName: string;
  nextLine?: string; // "Set 3 of 4 · 185 × 7", etc.
  onClose: () => void;
}

// Full-screen countdown that opens after a set is logged. Auto-dismisses
// when the timer reaches 0. -30s / +30s adjust the remaining time;
// Skip rest closes immediately.
//
// Countdown is derived from an `endsAt` wall-clock timestamp rather than a
// decrementing counter, so it stays accurate across app backgrounding on
// iOS Safari. useTick forces a re-render every 500ms AND on visibilitychange
// so the display catches up the instant you return to the app.
export default function RestTimer({
  initialSeconds,
  exerciseName,
  nextLine,
  onClose,
}: Props) {
  const [endsAt, setEndsAt] = useState<number>(
    () => Date.now() + initialSeconds * 1000,
  );
  const [total, setTotal] = useState(initialSeconds);
  const now = useTick(500);

  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  // Schedule a service-worker-driven notification for `endsAt` — fires
  // even when the app is backgrounded (see scheduledNotifications.ts).
  // Re-runs whenever endsAt changes so ±30s adjustments reschedule
  // cleanly. Cancels on unmount so a skipped-rest doesn't ping later.
  useEffect(() => {
    scheduleServiceWorkerNotification({
      id: "rest-timer",
      title: "Rest done",
      body: `${exerciseName} — ready for your next set.`,
      at: endsAt,
    });
    return () => cancelServiceWorkerNotification("rest-timer");
  }, [endsAt, exerciseName]);

  // Fire the "rest done" notification + vibration exactly once when the
  // timer runs out. Guarded with a ref so the auto-dismiss useEffect
  // doesn't re-fire it if React batches the transition oddly. On iOS
  // Safari this fires when the app returns to foreground if the timer
  // ran out while backgrounded (setInterval doesn't run in the
  // background; useTick catches up on visibilitychange).
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (left > 0) return;
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(200); } catch { /* noop */ }
      }
      fireLocalNotification("Rest done", "Ready for your next set.");
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const size = 248;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? left / total : 0;

  const mm = String(Math.floor(left / 60)).padStart(1, "0");
  const ss = String(left % 60).padStart(2, "0");

  // -30s / +30s: shift the end timestamp AND the total by the same amount.
  // Floor endsAt at "now + 1s" so pressing -30 near the end doesn't fire
  // onClose mid-adjust with a negative bounce.
  const adjust = (deltaSec: number) => {
    setEndsAt((prev) => Math.max(Date.now() + 1000, prev + deltaSec * 1000));
    setTotal((prev) => Math.max(1, prev + deltaSec));
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 backdrop-blur-xl">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
        Rest
      </div>
      <div className="relative">
        <svg width={size} height={size} className="block -rotate-90">
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
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{ transition: "stroke-dasharray 0.9s linear" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono tabular-nums" style={{ fontSize: 46, letterSpacing: "-0.02em" }}>
            {mm}:{ss}
          </div>
        </div>
      </div>
      <div className="mt-6 text-center">
        <div className="text-base font-medium leading-tight text-fg">
          {exerciseName}
        </div>
        {nextLine && (
          <div className="mt-1 font-mono text-[11px] text-muted">{nextLine}</div>
        )}
      </div>
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => adjust(-30)}
          className="rounded-[10px] border border-border bg-surface px-4 py-2 font-mono text-sm text-fg hover:border-border-strong"
        >
          −30s
        </button>
        <button
          onClick={() => adjust(30)}
          className="rounded-[10px] border border-border bg-surface px-4 py-2 font-mono text-sm text-fg hover:border-border-strong"
        >
          +30s
        </button>
        <button
          onClick={onClose}
          className="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-[#0a160d]"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}
