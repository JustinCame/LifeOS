import type { DailyLog } from '../db/types'

export type Stat = 'mind' | 'body' | 'bonds' | 'craft' | 'calm'

export const STATS: Stat[] = ['mind', 'body', 'bonds', 'craft', 'calm']

export const STAT_LABELS: Record<Stat, string> = {
  mind: 'Mind',
  body: 'Body',
  bonds: 'Bonds',
  craft: 'Craft',
  calm: 'Calm',
}

export type StatIcon = 'lens' | 'bell' | 'heart' | 'hammer' | 'moon'
export const STAT_ICON: Record<Stat, StatIcon> = {
  mind: 'lens',
  body: 'bell',
  bonds: 'heart',
  craft: 'hammer',
  calm: 'moon',
}

// Per-tag stat gains. Missing tags contribute nothing. `sick` is
// intentionally empty — it's exempt so illness days aren't rewarded.
export const TAG_GAINS: Record<string, Partial<Record<Stat, number>>> = {
  work:    { craft: 2, mind: 1 },
  study:   { mind: 5, craft: 1 },
  move:    { body: 4, calm: 1 }, // "Activity" (key stayed `move` for backcompat)
  friends: { bonds: 4 },
  family:  { bonds: 25, calm: 3 },
  create:  { craft: 6, mind: 2 },
  play:    { calm: 3, bonds: 1 },
  slow:    { calm: 5, body: 2 },
  out:     { mind: 4, body: 4, calm: 3 },
  sick:    {},
  travel:  { mind: 12, body: 3 },
  upkeep:  { calm: 3, body: 1 },
}

// Rank thresholds — 5 levels. Value ≥ threshold[i] unlocks rank i+1.
export const MONTHLY_CAPS: Record<Stat, number[]> = {
  mind:  [42,   84,   126,  168,  210],
  body:  [24,   48,   72,   96,   120],
  bonds: [22,   44,   66,   88,   110],
  craft: [32,   64,   96,   128,  160],
  calm:  [20,   40,   60,   80,   100],
}

export const YEARLY_CAPS: Record<Stat, number[]> = {
  mind:  [540,  1080, 1620, 2160, 2700],
  body:  [440,  880,  1320, 1760, 2200],
  bonds: [1000, 2000, 3000, 4000, 5000],
  craft: [470,  940,  1410, 1880, 2350],
  calm:  [520,  1040, 1560, 2080, 2600],
}

export type Period = 'month' | 'year'

// Sum stat gains across a set of daily logs. Same computation whether the
// window is monthly or yearly — only the enclosing filter differs.
export function computeStats(logs: DailyLog[]): Record<Stat, number> {
  const out: Record<Stat, number> = {
    mind: 0,
    body: 0,
    bonds: 0,
    craft: 0,
    calm: 0,
  }
  for (const log of logs) {
    for (const tag of log.tags ?? []) {
      const gains = TAG_GAINS[tag]
      if (!gains) continue
      for (const s of STATS) {
        out[s] += gains[s] ?? 0
      }
    }
  }
  return out
}

// Per-tag totals for the breakdown view. Sparse — only tags actually used
// appear in the map.
export function computeStatsByTag(
  logs: DailyLog[],
): Record<string, Record<Stat, number>> {
  const out: Record<string, Record<Stat, number>> = {}
  for (const log of logs) {
    for (const tag of log.tags ?? []) {
      const gains = TAG_GAINS[tag]
      if (!gains) continue
      if (!out[tag]) {
        out[tag] = { mind: 0, body: 0, bonds: 0, craft: 0, calm: 0 }
      }
      for (const s of STATS) {
        out[tag][s] += gains[s] ?? 0
      }
    }
  }
  return out
}

export function rankOf(value: number, thresholds: number[]): number {
  let rank = 0
  for (const t of thresholds) {
    if (value >= t) rank++
    else break
  }
  return rank
}

// 0..1 progress toward the next rank threshold. Returns 1 when maxed.
export function progressToNextRank(
  value: number,
  thresholds: number[],
): number {
  const rank = rankOf(value, thresholds)
  if (rank >= thresholds.length) return 1
  const lower = rank === 0 ? 0 : thresholds[rank - 1]
  const upper = thresholds[rank]
  const span = upper - lower
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (value - lower) / span))
}

export function maxCap(caps: number[]): number {
  return caps[caps.length - 1]
}

/* -------------------- Period windows -------------------- */

export function startOfMonth(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
}
export function endOfMonth(now = new Date()): number {
  // Exclusive: first millisecond of the next month.
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
}
export function startOfYear(now = new Date()): number {
  return new Date(now.getFullYear(), 0, 1).getTime()
}
export function endOfYear(now = new Date()): number {
  return new Date(now.getFullYear() + 1, 0, 1).getTime()
}

// "3d 4h" / "5h 12m" — used by the detail view for the reset countdown.
export function formatTimeUntil(ts: number, now: number = Date.now()): string {
  const ms = Math.max(0, ts - now)
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (days >= 1) return `${days}d ${hours}h`
  if (hours >= 1) return `${hours}h ${mins}m`
  return `${mins}m`
}
