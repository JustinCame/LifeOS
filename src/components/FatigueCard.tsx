import { useMemo, useState } from "react";
import { FRONT_MUSCLES, BACK_MUSCLES, type MuscleDef } from "body-muscles";
import {
  MUSCLE_LABELS,
  bmGroup,
  fatigueFill,
  rankFatigue,
  recoveryDays,
  type MuscleGroup,
} from "../lib/fatigue";
import { Section } from "./primitives";

interface Props {
  fatigue: Record<MuscleGroup, number>;
}

// Twin body figures + a ranked list; selecting a muscle (by tap on the SVG
// or on a list row) reveals a footer with recovery estimate. Section meta
// shows average of the top 4, or "fresh" when nothing is significantly
// fatigued.
export default function FatigueCard({ fatigue }: Props) {
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  const ranked = useMemo(() => rankFatigue(fatigue), [fatigue]);
  const topAvg = useMemo(() => {
    if (ranked.length === 0) return 0;
    const top = ranked.slice(0, 4);
    return Math.round(top.reduce((s, r) => s + r.pct, 0) / top.length);
  }, [ranked]);

  const selPct = selected ? fatigue[selected] : 0;

  return (
    <Section
      title="Fatigue"
      meta={ranked.length === 0 ? "fresh" : `${topAvg}% avg`}
    >
      <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1fr_112px] gap-2 px-3.5 py-3">
          <BodyFigure
            muscles={FRONT_MUSCLES}
            viewBox="0 0 35 93"
            fatigue={fatigue}
            selected={selected}
            onSelect={setSelected}
          />
          <BodyFigure
            muscles={BACK_MUSCLES}
            viewBox="37 0 35 93"
            fatigue={fatigue}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="flex min-w-0 flex-col gap-1 py-1">
            {ranked.length === 0 ? (
              <div className="font-mono text-[11px] text-subtle">
                No fatigue yet — start logging sets.
              </div>
            ) : (
              ranked.map((r) => (
                <button
                  key={r.group}
                  onClick={() =>
                    setSelected((cur) => (cur === r.group ? null : r.group))
                  }
                  className={`flex w-full items-baseline justify-between rounded-[6px] px-1.5 py-0.5 text-left text-[11px] font-mono transition ${
                    selected === r.group
                      ? "bg-surface-2 text-fg"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <span className="truncate">{MUSCLE_LABELS[r.group]}</span>
                  <span className="ml-2 text-fg">{r.pct}%</span>
                </button>
              ))
            )}
          </div>
        </div>

        {selected && (
          <div className="flex items-baseline justify-between border-t border-border px-3.5 py-2 font-mono text-[11px] text-muted">
            <span>
              <span className="text-fg">{MUSCLE_LABELS[selected]}</span>
              {" · "}
              {selPct}%
            </span>
            <span>
              {selPct === 0
                ? "fresh"
                : `recovers in ~${recoveryDays(selPct)}d`}
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}

function BodyFigure({
  muscles,
  viewBox,
  fatigue,
  selected,
  onSelect,
}: {
  muscles: readonly MuscleDef[];
  viewBox: string;
  fatigue: Record<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup | null) => void;
}) {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      style={{ maxHeight: 240 }}
    >
      {muscles.map((m) => {
        const group = bmGroup(m.id);
        // Deliberately excluded so only erector/QL regions light up as
        // "Lower back" — the spine strip isn't a real muscle group.
        if (m.id === "spine") {
          return (
            <path
              key={m.id}
              d={m.path}
              fill="color-mix(in oklab, var(--color-surface-2) 70%, transparent)"
              stroke="var(--color-border-strong)"
              strokeWidth="0.12"
            />
          );
        }
        const isSel = group !== null && selected === group;
        const fill =
          group === null
            ? "color-mix(in oklab, var(--color-surface-2) 70%, transparent)"
            : fatigueFill(fatigue[group] ?? 0);
        const stroke = isSel
          ? "var(--color-fg)"
          : "var(--color-border-strong)";
        const sw = isSel ? 0.32 : 0.12;
        return (
          <path
            key={m.id}
            d={m.path}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            style={{ cursor: group ? "pointer" : "default" }}
            onClick={() => {
              if (!group) return;
              onSelect(selected === group ? null : group);
            }}
          />
        );
      })}
    </svg>
  );
}
