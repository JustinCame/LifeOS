import { useEffect, useState } from "react";
import { findDemo, type Demo } from "../lib/exerciseDemo";

interface Props {
  exerciseName: string;
  // Coach's tip on the specific slot (from the template/user's program).
  note?: string;
  onClose: () => void;
}

// Full-screen How-to. Image dominant, coach note + DB instructions on the
// side (portrait: below the image; landscape / wider: right of the image).
export default function ExerciseDemoScreen({
  exerciseName,
  note,
  onClose,
}: Props) {
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

  const [demo, setDemo] = useState<Demo | null>(null);
  const [loading, setLoading] = useState(true);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    findDemo(exerciseName).then((d) => {
      if (!cancelled) {
        setDemo(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseName]);

  useEffect(() => {
    if (!demo || demo.imageUrls.length < 2) return;
    setFrame(0);
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % demo.imageUrls.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [demo]);

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${
        shown ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
    >
      <div className="flex-1 overflow-y-auto pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="mb-3 flex items-center justify-between px-[18px]">
          <button
            onClick={close}
            className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg"
          >
            <ChevronLeft />
            Back
          </button>
        </div>

        <header className="px-[18px] pb-3">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            {exerciseName}
          </h1>
          {demo && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {demo.matchedName.toLowerCase() !==
                exerciseName.toLowerCase() && (
                <span className="text-subtle">
                  matched: {demo.matchedName}
                </span>
              )}
              {demo.primaryMuscles.map((m) => (
                <span
                  key={m}
                  className="rounded-[5px] border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Layout: stacked on portrait phones, side-by-side on wider viewports. */}
        <div className="grid grid-cols-1 gap-3 px-[18px] md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
          {/* Demo pane */}
          <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
            {loading ? (
              <div className="flex aspect-square items-center justify-center font-mono text-[11px] text-subtle">
                Loading demo…
              </div>
            ) : !demo ? (
              <div className="flex aspect-square items-center justify-center px-4 text-center font-mono text-[11px] text-subtle">
                No demo found for this exercise.
              </div>
            ) : (
              <div className="relative aspect-square w-full bg-bg">
                {demo.imageUrls[frame] && (
                  <img
                    src={demo.imageUrls[frame]}
                    alt={demo.matchedName}
                    className="h-full w-full object-contain"
                  />
                )}
                {demo.imageUrls.length > 1 && (
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10px] text-white">
                    {frame + 1} / {demo.imageUrls.length}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tips pane */}
          <div className="space-y-3">
            {note && (
              <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3">
                <div className="mb-1 text-xs uppercase tracking-[0.06em] text-muted">
                  Coach note
                </div>
                <div className="text-sm leading-snug text-fg">{note}</div>
              </div>
            )}
            {demo && demo.instructions.length > 0 && (
              <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3">
                <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
                  Instructions
                </div>
                <ol className="list-decimal space-y-1.5 pl-4 text-sm leading-snug text-fg">
                  {demo.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
