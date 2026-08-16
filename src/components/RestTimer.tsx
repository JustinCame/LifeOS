import { useEffect, useState } from "react";

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
export default function RestTimer({
  initialSeconds,
  exerciseName,
  nextLine,
  onClose,
}: Props) {
  const [left, setLeft] = useState(initialSeconds);
  const [total, setTotal] = useState(initialSeconds);

  useEffect(() => {
    if (left <= 0) {
      onClose();
      return;
    }
    const id = window.setInterval(() => {
      setLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearInterval(id);
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

  const adjust = (delta: number) => {
    setLeft((v) => Math.max(1, v + delta));
    setTotal((t) => Math.max(1, t + delta));
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
