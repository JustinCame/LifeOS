import { useEffect, useState } from "react";
import type { WorkoutExercise } from "../db/types";

interface Props {
  exercise: WorkoutExercise;
  onPick: (newName: string) => void;
  onClose: () => void;
}

const TRANSITION_MS = 280;

// Bottom sheet listing the 3 alternatives on this slot, plus the original
// name (as an option) when the slot has already been swapped so the user
// can swap back.
export default function SwapSheet({ exercise, onPick, onClose }: Props) {
  const [shown, setShown] = useState(false);
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

  // Options: alternatives from the slot, plus original if we're swapped.
  const options: string[] = [];
  for (const alt of exercise.alternatives ?? []) {
    if (alt !== exercise.exerciseName) options.push(alt);
  }
  if (exercise.swappedFrom && exercise.swappedFrom !== exercise.exerciseName) {
    if (!options.includes(exercise.swappedFrom)) {
      options.unshift(exercise.swappedFrom);
    }
  }

  return (
    <>
      <div
        onClick={interactive ? close : undefined}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        } ${interactive ? "" : "pointer-events-none"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Swap · {exercise.exerciseName}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div className="px-[18px] pb-6 pt-1">
          <p className="mb-3 font-mono text-[11px] text-muted">
            Same sets and rep target. You can swap back any time.
          </p>
          {options.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
              No alternatives set for this slot.
            </div>
          ) : (
            <div className="space-y-1">
              {options.map((name) => {
                const isOriginal = name === exercise.swappedFrom;
                return (
                  <button
                    key={name}
                    onClick={() => onPick(name)}
                    className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.995]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight text-fg">{name}</div>
                      {isOriginal && (
                        <div className="mt-0.5 font-mono text-[10px] text-subtle">
                          original slot
                        </div>
                      )}
                    </div>
                    <span className="text-subtle">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
