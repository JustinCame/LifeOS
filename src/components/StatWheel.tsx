import { Fragment } from "react";
import {
  STATS,
  STAT_ICON,
  STAT_LABELS,
  rankOf,
  progressToNextRank,
  type Stat,
} from "../lib/stats";

interface Props {
  values: Record<Stat, number>;
  caps: Record<Stat, number[]>; // 5 thresholds per stat
  size?: number;
}

// Geometry ported from the Stat Wheel.html mockup — a 5-node radial
// display where each node's "beam" grows outward with rank (0-5), and a
// progress ring around each node fills toward the next rank threshold.
export default function StatWheel({ values, caps, size = 280 }: Props) {
  const MAX = 5;
  const ACC = "var(--color-accent-fg)";
  const GOLD = "oklch(0.80 0.13 88)";
  const INK = "var(--color-fg)";
  const NODE_BG = "var(--color-bg)";
  const CX = 210;
  const CY = 215;
  const R = 176;
  const CORE = 58;
  const HALF = 17;
  const RTIP = R - 23;

  const polar = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: CX + rad * Math.cos(a), y: CY + rad * Math.sin(a) };
  };

  const NODES = STATS.map((stat, i) => {
    const deg = -90 + i * 72;
    const p = polar(deg, R);
    return { stat, i, deg, x: p.x, y: p.y };
  });

  // Precompute rank + ring progress per stat.
  const derived = NODES.map((n) => {
    const thresholds = caps[n.stat];
    const value = values[n.stat] ?? 0;
    return {
      ...n,
      rank: rankOf(value, thresholds),
      ringPct: progressToNextRank(value, thresholds),
      value,
      max: thresholds[thresholds.length - 1],
    };
  });

  // Ring gaps in the core circle — leave a break behind each active stat so
  // its beam appears to emerge from the core (mirrors the mockup).
  const gaps: [number, number][] = [];
  let cur = -90 - HALF;
  for (const n of NODES) {
    if ((derived[n.i].rank ?? 0) > 0) {
      gaps.push([cur, n.deg - HALF]);
      cur = n.deg + HALF;
    }
  }
  gaps.push([cur, 270 - HALF]);

  return (
    <svg
      viewBox="6 11 408 408"
      width={size}
      height={size}
      style={{ display: "block", maxWidth: "100%" }}
    >
      {/* Grain filter for a subtle texture — matches the mockup */}
      <defs>
        <filter id="statwheel-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      {/* Core disc */}
      <circle
        cx={CX}
        cy={CY}
        r={CORE}
        fill="var(--color-accent)"
        fillOpacity="0.3"
      />
      {gaps
        .filter(([a, b]) => b - a > 0.6)
        .map(([a, b], i) => {
          const p0 = polar(a, CORE);
          const p1 = polar(b, CORE);
          return (
            <path
              key={i}
              d={`M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A${CORE} ${CORE} 0 ${b - a > 180 ? 1 : 0} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`}
              fill="none"
              stroke={ACC}
              strokeWidth="1.1"
            />
          );
        })}

      {/* Concentric rank rings */}
      {[CORE, 92, 134, R].map((rad, k) => (
        <circle
          key={rad}
          cx={CX}
          cy={CY}
          r={rad}
          fill="none"
          stroke={k === 3 ? ACC : INK}
          strokeWidth={k === 3 ? 2.4 : 0.9}
          opacity={k === 3 ? 0.75 : 0.14}
          strokeDasharray={k === 1 ? "2 7" : undefined}
        />
      ))}

      {/* Beams — one per stat, rank drives height */}
      {derived.map((n) => {
        const lv = n.rank;
        const s = lv / MAX;
        const bL = polar(n.deg - HALF, CORE);
        const bR = polar(n.deg + HALF, CORE);
        const t = (CORE + (RTIP - CORE) * s) / R;
        const apex = { x: CX + (n.x - CX) * t, y: CY + (n.y - CY) * t };
        const tri = (p: { x: number; y: number }) =>
          `M${bL.x.toFixed(1)},${bL.y.toFixed(1)} L${p.x.toFixed(1)},${p.y.toFixed(1)} L${bR.x.toFixed(1)},${bR.y.toFixed(1)}`;
        return (
          <g key={n.stat}>
            <line
              x1={CX}
              y1={CY}
              x2={n.x}
              y2={n.y}
              stroke={lv >= 4 ? ACC : INK}
              strokeWidth={0.8 + s * 1.9}
              opacity={0.22 + s * 0.62}
            />
            <path
              d={`${tri(polar(n.deg, RTIP))} Z`}
              fill="none"
              stroke={INK}
              strokeWidth="0.8"
              opacity="0.22"
              strokeLinejoin="round"
            />
            {lv > 0 && (
              <Fragment>
                <path
                  d={`${tri(apex)} Z`}
                  fill="var(--color-accent)"
                  fillOpacity="0.3"
                />
                <path
                  d={tri(apex)}
                  fill="none"
                  stroke={ACC}
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
              </Fragment>
            )}
            {Array.from({ length: MAX }, (_, k) => {
              const q = polar(
                n.deg,
                CORE + (k + 1) * ((RTIP - CORE) / (MAX + 1)),
              );
              const earned = k < lv;
              return (
                <circle
                  key={k}
                  cx={q.x}
                  cy={q.y}
                  r={earned ? 2.1 : 1.6}
                  fill={earned ? ACC : INK}
                  opacity={earned ? 0.85 : 0.28}
                />
              );
            })}
          </g>
        );
      })}

      {/* Node icons + progress rings */}
      {derived.map((n) => {
        const lv = n.rank;
        const pct = n.ringPct;
        const C = 2 * Math.PI * 19;
        const maxed = lv >= MAX;
        const ring = maxed ? GOLD : ACC;
        const iconColor =
          maxed ? GOLD : lv >= 3 ? ACC : INK;
        const iconOpacity = maxed ? 1 : 0.45 + pct * 0.55;
        return (
          <g key={n.stat}>
            {maxed && (
              <circle cx={n.x} cy={n.y} r="25" fill={GOLD} opacity="0.16" />
            )}
            <circle cx={n.x} cy={n.y} r="22" fill={NODE_BG} opacity="0.9" />
            <circle
              cx={n.x}
              cy={n.y}
              r="19"
              fill="none"
              stroke={INK}
              strokeOpacity="0.32"
              strokeWidth="1"
            />
            <circle
              cx={n.x}
              cy={n.y}
              r="19"
              fill="none"
              stroke={ring}
              strokeWidth={maxed ? 3 : 2.6}
              strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`}
              transform={`rotate(-90 ${n.x} ${n.y})`}
            />
            <g
              transform={`translate(${n.x} ${n.y}) scale(0.6)`}
              fill={iconColor}
              color={iconColor}
              opacity={iconOpacity}
            >
              <StatIconGlyph name={STAT_ICON[n.stat]} />
            </g>
            {/* Label under the node */}
            <text
              x={n.x}
              y={n.y + 40}
              textAnchor="middle"
              fill={INK}
              opacity="0.65"
              fontSize="10"
              fontFamily="var(--font-mono, monospace)"
            >
              {STAT_LABELS[n.stat]}
            </text>
          </g>
        );
      })}

      {/* Center hub */}
      <circle
        cx={CX}
        cy={CY}
        r="7"
        fill="none"
        stroke={INK}
        strokeWidth="1.4"
        opacity="0.8"
      />
      <circle cx={CX} cy={CY} r="2.2" fill={INK} />
      <rect
        x="6"
        y="11"
        width="408"
        height="408"
        filter="url(#statwheel-grain)"
        opacity="0.12"
        style={{ mixBlendMode: "overlay" }}
        pointerEvents="none"
      />
    </svg>
  );
}

/* -------------------- Icons (from Stat Wheel.html) -------------------- */

function StatIconGlyph({ name }: { name: string }) {
  switch (name) {
    case "lens":
      return (
        <Fragment>
          <path d="M-2.2,-8.2 C-6,-11.2 -9.5,-11.6 -13,-10.6 v17.4 C-9.5,5.8 -6,6.2 -2.2,9.2 Z" />
          <path d="M2.2,-8.2 C6,-11.2 9.5,-11.6 13,-10.6 v17.4 C9.5,5.8 6,6.2 2.2,9.2 Z" />
          <rect x="-0.9" y="-8.4" width="1.8" height="17.8" rx="0.9" opacity="0.85" />
        </Fragment>
      );
    case "bell":
      return (
        <Fragment>
          <rect x="-14" y="-2.6" width="28" height="5.2" rx="1.4" />
          <rect x="-17" y="-9.5" width="5.5" height="19" rx="1.8" />
          <rect x="11.5" y="-9.5" width="5.5" height="19" rx="1.8" />
        </Fragment>
      );
    case "heart":
      return (
        <path d="M0,11 C-11,3 -13,-4 -8.5,-8.5 C-4.5,-12.5 -0.5,-9 0,-6 C0.5,-9 4.5,-12.5 8.5,-8.5 C13,-4 11,3 0,11 Z" />
      );
    case "hammer":
      return (
        <g transform="rotate(-22)">
          <rect x="-13" y="-14" width="26" height="9.5" rx="2.2" />
          <rect x="-2.6" y="-5" width="5.2" height="21" rx="2" />
        </g>
      );
    case "moon":
      return (
        <path
          d="M8.5,9.5 A13,13 0 1 1 8.5,-9.5 A10.5,10.5 0 1 0 8.5,9.5 Z"
          transform="rotate(-20)"
        />
      );
    default:
      return null;
  }
}
