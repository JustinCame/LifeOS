import { db } from '../db'
import type { CardioKind, CardioSession } from '../db/types'

export const CARDIO_LABELS: Record<CardioKind, string> = {
  liss: 'Zone 2 / LISS',
  hiit: 'HIIT',
}

// Suggested modalities per kind — used as quick-pick chips in the log sheet.
export const CARDIO_MODALITIES: Record<CardioKind, string[]> = {
  liss: ['Incline walk', 'Bike', 'Stairmaster', 'Row'],
  hiit: ['Bike', 'Row', 'Sprints'],
}

export async function addCardioSession(input: {
  kind: CardioKind
  durationMin: number
  modality?: string
  notes?: string
  // Optional past date (ms). Defaults to now for live logging from the dial.
  date?: number
}): Promise<number> {
  const now = Date.now()
  const date = input.date ?? now
  const id = await db.cardio_sessions.add({
    date,
    kind: input.kind,
    durationMin: input.durationMin,
    ...(input.modality?.trim()
      ? { modality: input.modality.trim() }
      : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    createdAt: now,
  })
  return id as number
}

export async function deleteCardioSession(id: number): Promise<void> {
  await db.cardio_sessions.delete(id)
}

// Weekly targets surfaced in the Fitness > Cardio header. Matches the
// guidance copy already in the empty-state hint ("2× Zone 2 and 1× HIIT").
export const CARDIO_WEEKLY_TARGETS: Record<CardioKind, number> = {
  liss: 2,
  hiit: 1,
}

// Count sessions in the current Sun→Sat week. Caller passes already-loaded
// sessions so we don't re-hit Dexie for an aggregate view of data we already
// have on screen.
export function countSessionsThisWeek(
  sessions: CardioSession[],
): Record<CardioKind, number> {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - now.getDay())
  const weekStart = sunday.getTime()
  const weekEnd = weekStart + 7 * 86_400_000

  let liss = 0
  let hiit = 0
  for (const s of sessions) {
    if (s.date < weekStart || s.date >= weekEnd) continue
    if (s.kind === 'liss') liss++
    else if (s.kind === 'hiit') hiit++
  }
  return { liss, hiit }
}
