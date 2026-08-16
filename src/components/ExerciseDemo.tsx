import { useEffect, useState } from "react";
import { findDemo, type Demo } from "../lib/exerciseDemo";

interface Props {
  exerciseName: string;
}

// Small inline demo shown inside an ExerciseCard when the user opens the
// "How to" toggle. Auto-flips between the two frames of the DB entry so
// the movement is legible.
export default function ExerciseDemo({ exerciseName }: Props) {
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

  // Ping-pong through frames every 900ms so start ↔ end reads as motion.
  useEffect(() => {
    if (!demo || demo.imageUrls.length < 2) return;
    setFrame(0);
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % demo.imageUrls.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [demo]);

  if (loading) {
    return (
      <div className="border-t border-border bg-surface-2/40 px-3.5 py-3 font-mono text-[11px] text-subtle">
        Loading demo…
      </div>
    );
  }
  if (!demo) {
    return (
      <div className="border-t border-border bg-surface-2/40 px-3.5 py-3 font-mono text-[11px] text-subtle">
        No demo found for this exercise.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface-2/40 px-3.5 py-3">
      <div className="flex items-start gap-3">
        {demo.imageUrls[frame] && (
          <img
            src={demo.imageUrls[frame]}
            alt={demo.matchedName}
            loading="lazy"
            className="h-32 w-32 flex-shrink-0 rounded-[8px] bg-bg object-contain"
          />
        )}
        <div className="min-w-0 flex-1">
          {demo.instructions.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-muted">
              {demo.instructions.slice(0, 4).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <div className="font-mono text-[11px] text-subtle">
              No text instructions in DB.
            </div>
          )}
          {demo.matchedName.toLowerCase() !==
            exerciseName.toLowerCase() && (
            <div className="mt-2 font-mono text-[10px] text-subtle">
              matched: {demo.matchedName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
