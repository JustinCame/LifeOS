// Passive-insight engine.
//
// The one architectural rule: TypeScript decides WHEN to speak, the model
// only decides WHAT TO SAY. That means every model call is guarded by a
// deterministic trigger + inputHash dedupe. The engine is the layer that
// enforces that discipline — triggers surface candidates, this file decides
// which ones actually go to the model and which get skipped.
//
// Cost guards (in order they run per candidate):
//   1. inputHash dedupe — if we've already produced an insight (or a NONE)
//      for the exact same slice, skip. This is the primary cost guard.
//   2. Recent-dismissal check — if the user just dismissed a similar insight
//      (same kind + subjectKey) within ttlHours, skip.
//   3. Daily budget cap — at most `insights_daily_cap` model-generated
//      insights per day. Above that, only a higher-severity insight can
//      displace a lower-severity `new` one.

import { db, getSetting, setSetting } from '../../db'
import type { Insight } from '../../db/types'
import { startOfDay } from '../habits'
import { TRIGGERS, makeContext, type Trigger, type TriggerResult } from './triggers'
import { generateInsight } from './generate'
import { queuePush } from './pushQueue'

// Re-scan cadence. runTriggers('scheduled') is called from App.tsx on mount
// and on visibilitychange; we skip if we ran within this window so tab focus
// / route changes don't multiply cost (spec §5, "50–100× cost multiplier").
const SCHEDULED_TTL_MS = 30 * 60 * 1000
const LAST_RUN_KEY = 'insights_last_run'

// Settings-backed set of inputHashes the model responded to with NONE. Skip
// those on subsequent runs so we don't ask again on the same slice. LRU-
// capped so the set doesn't grow unbounded.
const NONE_HASHES_KEY = 'insights_none_hashes'
const NONE_HASHES_CAP = 500

// Daily budget for model-generated insights (Phase 1 demo doesn't count).
// 12 covers a heavy day: morning_brief + 3-4 macro entries + workout_verdict
// + a couple scheduled fitness triggers + occasional tdee_drift/food_sanity.
// Users can override via the `insights_daily_cap` setting.
const DAILY_CAP_KEY = 'insights_daily_cap'
const DEFAULT_DAILY_CAP = 12

const SEVERITY_RANK: Record<Insight['severity'], number> = {
  info: 0,
  notable: 1,
  urgent: 2,
}

export type Cadence = 'on_write' | 'scheduled'

export async function runTriggers(
  cadence: Cadence,
  only?: string[],
): Promise<Insight[]> {
  // Staleness gate — scheduled cadence only. on_write is fired explicitly
  // from mutation helpers and shouldn't be rate-limited by this timer.
  if (cadence === 'scheduled') {
    const last = (await getSetting<number>(LAST_RUN_KEY)) ?? 0
    if (Date.now() - last < SCHEDULED_TTL_MS) return []
    await setSetting(LAST_RUN_KEY, Date.now())
  }

  // Always seed the Phase 1 demo card once per day so we know the plumbing
  // still works after every change (until Phase 2's real triggers replace it
  // in normal daily use — but the demo is harmless).
  const seeded: Insight[] = []
  const demo = await seedPhase1Demo()
  if (demo) seeded.push(demo)

  const ctx = makeContext()
  const cap = (await getSetting<number>(DAILY_CAP_KEY)) ?? DEFAULT_DAILY_CAP

  const scoped = TRIGGERS.filter((t) => {
    if (only && !only.includes(t.id)) return false
    if (t.cadence === 'both') return true
    return t.cadence === cadence
  })

  const inserted: Insight[] = [...seeded]
  for (const trigger of scoped) {
    try {
      const results = await trigger.check(ctx)
      if (!results || results.length === 0) continue
      for (const result of results) {
        const insight = await tryGenerate(trigger, result, ctx.today, cap)
        if (insight) inserted.push(insight)
      }
    } catch (err) {
      // A trigger crash must never break the app. Swallow and log.
      console.warn(`[insights] trigger ${trigger.id} threw:`, err)
    }
  }
  return inserted
}

// ---- Status mutations (called from InsightCard) ----

export async function markSeen(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const now = Date.now()
  await db.transaction('rw', db.insights, async () => {
    for (const id of ids) {
      const row = await db.insights.get(id)
      // Only bump 'new' → 'seen'. Never overwrite dismissed/accepted.
      if (row && row.status === 'new') {
        await db.insights.update(id, { status: 'seen', updatedAt: now })
      }
    }
  })
}

export async function dismissInsight(
  id: number,
  reason?: string,
): Promise<void> {
  void reason // Future: feed dismissal reasons back into the prompt
  await db.insights.update(id, {
    status: 'dismissed',
    updatedAt: Date.now(),
  })
}

export async function acceptInsight(id: number): Promise<void> {
  await db.insights.update(id, {
    status: 'accepted',
    updatedAt: Date.now(),
  })
}

// ---- Per-candidate pipeline ----

async function tryGenerate(
  trigger: Trigger,
  result: TriggerResult,
  today: number,
  cap: number,
): Promise<Insight | null> {
  const inputHash = await hashSlice(trigger.id, result.subjectKey, result.slice)

  // Guard 1: has the model already been asked about this exact slice?
  const existingByHash = await db.insights
    .where('kind')
    .equals(trigger.id)
    .and((i) => i.inputHash === inputHash)
    .first()
  if (existingByHash) return null

  const noneHashes = await getNoneHashes()
  if (noneHashes.includes(inputHash)) return null

  // Guard 2: same kind + subjectKey dismissed recently? Skip during the
  // trigger's ttlHours cool-down so we don't nag right after dismissal.
  if (result.subjectKey !== undefined) {
    const cutoff = Date.now() - trigger.ttlHours * 3600_000
    const recentDismiss = await db.insights
      .where('kind')
      .equals(trigger.id)
      .and(
        (i) =>
          i.subjectKey === result.subjectKey &&
          i.status === 'dismissed' &&
          i.updatedAt >= cutoff,
      )
      .first()
    if (recentDismiss) return null
  }

  // Feed the last ~10 dismissed titles of the same kind back to the model
  // so it stops repeating itself. This is what makes the system stop nagging
  // beyond simple ttl expiry.
  const dismissed = await db.insights
    .where('kind')
    .equals(trigger.id)
    .and((i) => i.status === 'dismissed')
    .reverse()
    .sortBy('updatedAt')
  const recentlyDismissedTitles = dismissed.slice(0, 10).map((i) => i.title)

  const outcome = await generateInsight({
    tier: trigger.model,
    promptHint: result.promptHint,
    slice: result.slice,
    recentlyDismissedTitles,
  })

  if (outcome.kind === 'skipped') {
    // No API key or transient failure. Don't record — let the next run try.
    return null
  }
  if (outcome.kind === 'none') {
    // Model looked and had nothing useful to say. Record so we don't ask
    // again on the exact same slice.
    await recordNoneHash(inputHash)
    return null
  }

  // Guard 3: daily budget. Count only model-generated insights from today.
  const todaysGenerated = await db.insights
    .where('date')
    .equals(today)
    .and((i) => i.model !== 'fake')
    .toArray()

  if (todaysGenerated.length >= cap) {
    // Only insert if this insight is higher severity than the lowest-severity
    // `new` insight from today. That one gets replaced.
    const newOnes = todaysGenerated.filter((i) => i.status === 'new')
    if (newOnes.length === 0) return null
    const lowest = newOnes.reduce((a, b) =>
      SEVERITY_RANK[a.severity] <= SEVERITY_RANK[b.severity] ? a : b,
    )
    if (SEVERITY_RANK[result.severity] <= SEVERITY_RANK[lowest.severity]) {
      return null
    }
    if (lowest.id !== undefined) await db.insights.delete(lowest.id)
  }

  const now = Date.now()
  const row: Insight = {
    coach: trigger.coach,
    kind: trigger.id,
    date: today,
    subjectKey: result.subjectKey,
    title: outcome.insight.title,
    body: outcome.insight.body,
    actions: outcome.insight.actions,
    severity: result.severity,
    status: 'new',
    inputHash,
    model: modelIdForTier(trigger.model),
    surface: trigger.surface,
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.insights.add(row)

  // If this trigger declares a pushSlot, queue the insight for the next
  // matching cron via /api/queue-push. Fire-and-forget: a queue failure
  // must never block the in-app insight from rendering.
  if (trigger.pushSlot) {
    void queuePush({
      slot: trigger.pushSlot,
      title: outcome.insight.title,
      body: outcome.insight.body,
    }).catch(() => {
      /* pushQueue already logs; passive layer must never break */
    })
  }

  return { ...row, id }
}

// ---- Hashing ----

async function hashSlice(
  triggerId: string,
  subjectKey: string | undefined,
  slice: Record<string, unknown>,
): Promise<string> {
  const stable = stableStringify(slice)
  const input = `${triggerId}\n${subjectKey ?? ''}\n${stable}`
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// JSON.stringify with recursively sorted object keys — otherwise a slice
// built with different key insertion order would hash to a different value
// even though it represents the same data.
function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(normalize)
  const obj = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = normalize(obj[key])
  }
  return sorted
}

// ---- NONE hash skip-list (settings-backed, LRU-capped) ----

async function getNoneHashes(): Promise<string[]> {
  return (await getSetting<string[]>(NONE_HASHES_KEY)) ?? []
}

async function recordNoneHash(hash: string): Promise<void> {
  const existing = await getNoneHashes()
  if (existing.includes(hash)) return
  const next = [...existing, hash]
  if (next.length > NONE_HASHES_CAP) {
    next.splice(0, next.length - NONE_HASHES_CAP)
  }
  await setSetting(NONE_HASHES_KEY, next)
}

// ---- Model ID rendering ----

// Resolves the tier (haiku/sonnet/opus) into the exact model ID we called
// so it lands in the insight row for later audit. Kept in sync with
// generate.ts's MODEL_BY_TIER. Duplicated deliberately to avoid a cycle.
function modelIdForTier(tier: 'haiku' | 'sonnet' | 'opus'): string {
  switch (tier) {
    case 'haiku':
      return 'claude-haiku-4-5'
    case 'sonnet':
      return 'claude-sonnet-4-6'
    case 'opus':
      return 'claude-opus-4-7'
  }
}

// ---- Phase 1 demo (kept for now) ----

async function seedPhase1Demo(): Promise<Insight | null> {
  const today = startOfDay()
  const inputHash = `phase1_demo:${today}`
  const existing = await db.insights.where('kind').equals('phase1_demo').first()
  if (existing && existing.inputHash === inputHash) return null

  const now = Date.now()
  const insight: Insight = {
    coach: 'home',
    kind: 'phase1_demo',
    date: today,
    title: 'Passive insight layer wired up',
    body: "This is a hardcoded demo card. Real triggers land in Phase 2, starting with macro gaps after you log a meal. Dismiss this once you've confirmed it sticks across a reload.",
    actions: [],
    severity: 'info',
    status: 'new',
    inputHash,
    model: 'fake',
    surface: 'home_top',
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.insights.add(insight)
  return { ...insight, id }
}
