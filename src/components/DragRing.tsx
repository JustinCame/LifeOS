import { useEffect, useRef, useState } from "react";

interface Props {
  size: number;
  stroke: number;
  // 0..1 externally-supplied progress. Ring animates when this changes while
  // the user isn't dragging.
  progress: number;
  // Numeric value (for count/duration) — used for the "current" seed on
  // pointer down + arrow-key steps.
  value: number;
  // Max value for slider semantics. For binary/avoid this is 1.
  target: number;
  // 'binary' | 'avoid' toggle on tap; others drag. Only affects semantics —
  // rendering is identical.
  toggle: boolean;
  // Called with the new numeric value while dragging (or once on toggle).
  onChange: (v: number) => void;
  // Called on pointerup so callers can flush a debounced write to Dexie.
  onCommit?: (v: number) => void;
  // Center readout content (e.g., "12 / 20" or "done").
  children?: React.ReactNode;
  // Visual override — e.g. `avoid` broken uses subtle instead of accent.
  arcColor?: string;
  // ARIA label — the habit name.
  label: string;
}

// Drag-to-set ring. `atan2(dx, -dy)` puts 0° at 12 o'clock and increases
// clockwise so the SVG (which is rotated -90°) reads intuitively.
export default function DragRing({
  size,
  stroke,
  progress,
  value,
  target,
  toggle,
  onChange,
  onCommit,
  children,
  arcColor,
  label,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Local display value beats the parent's during drag so the ring doesn't
  // lag while events flush.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const shown = dragging && dragValue !== null ? dragValue : value;
  const shownProgress =
    dragging && dragValue !== null
      ? target > 0
        ? Math.min(1, dragValue / target)
        : 0
      : progress;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const valueFromEvent = (e: React.PointerEvent): number => {
    const rect = ref.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg =
      (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.max(0, Math.min(target, Math.round((deg / 360) * target)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (toggle) {
      // Binary/avoid — flip 0 <-> 1 and commit immediately.
      const next = value >= 1 ? 0 : 1;
      onChange(next);
      onCommit?.(next);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const v = valueFromEvent(e);
    setDragValue(v);
    onChange(v);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || toggle) return;
    const v = valueFromEvent(e);
    setDragValue(v);
    onChange(v);
  };

  const stopDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const v = valueFromEvent(e);
    setDragging(false);
    setDragValue(null);
    onCommit?.(v);
  };

  // Keyboard access — ±1 (arrows) and ±5 (shift+arrows) for numeric kinds.
  // Toggle kinds use Enter/Space to flip.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (toggle) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const next = value >= 1 ? 0 : 1;
        onChange(next);
        onCommit?.(next);
      }
      return;
    }
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -(e.shiftKey ? 5 : 1);
    if (delta === 0) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(target, value + delta));
    onChange(next);
    onCommit?.(next);
  };

  // Reset local drag state if the caller resets the value externally while
  // pointer is still down — belt and suspenders.
  useEffect(() => {
    if (!dragging) setDragValue(null);
  }, [dragging]);

  const dashArray = `${c * shownProgress} ${c}`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={shown}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      style={{
        width: size,
        height: size,
        touchAction: "none",
        position: "relative",
      }}
      className={`select-none ${toggle ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ display: "block" }}
      >
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
          stroke={arcColor ?? "var(--color-accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          style={{
            // Suppress arc easing while dragging so it tracks the finger;
            // restore it so +5 / done animate.
            transition: dragging ? "none" : "stroke-dasharray 0.18s ease",
          }}
        />
      </svg>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ padding: stroke }}
      >
        {children}
      </div>
    </div>
  );
}
