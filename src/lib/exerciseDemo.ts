// Adapter for yuhonas/free-exercise-db.
//
// The DB is hosted as a single JSON file on jsdelivr. Fetched once per
// session and cached at module level; images live on the same CDN so the
// browser HTTP cache handles them naturally after first view.

const DB_URL =
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json'
const IMG_BASE =
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises'

interface RawEntry {
  id: string
  name: string
  images: string[]
  instructions: string[]
  equipment?: string
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
}

export interface Demo {
  matchedName: string
  imageUrls: string[]
  instructions: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
}

let dbPromise: Promise<RawEntry[]> | null = null

function loadDB(): Promise<RawEntry[]> {
  if (dbPromise) return dbPromise
  dbPromise = fetch(DB_URL)
    .then((r) => (r.ok ? (r.json() as Promise<RawEntry[]>) : []))
    .catch(() => [])
  return dbPromise
}

// Normalize a name so fuzzy comparisons can ignore punctuation, plurals,
// leading/trailing whitespace, and common substitutions (BB→barbell etc.).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bohp\b/g, 'overhead press')
    .replace(/\brdl\b/g, 'romanian deadlift')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Split on spaces, drop tiny/common tokens so we score on informative words.
const STOP = new Set([
  'the',
  'a',
  'and',
  'or',
  'with',
  'per',
  'for',
  'on',
  'in',
  'at',
])
function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

// Best-of-three match: exact → substring → token overlap. Rejects
// low-confidence overlaps so we don't confidently render the wrong demo.
export async function findDemo(name: string): Promise<Demo | null> {
  const db = await loadDB()
  if (db.length === 0) return null

  const q = normalize(name)
  const qTokens = tokens(name)

  let hit: RawEntry | undefined

  // 1. Exact name (case-insensitive, normalized).
  hit = db.find((e) => normalize(e.name) === q)

  // 2. Query is contained in the DB name, or vice versa.
  if (!hit) {
    hit = db.find((e) => {
      const n = normalize(e.name)
      return n.includes(q) || q.includes(n)
    })
  }

  // 3. Token overlap. Require at least 2 shared informative tokens (or
  //    all of them, whichever is fewer) so short queries don't false-positive.
  if (!hit && qTokens.length > 0) {
    const need = Math.min(2, qTokens.length)
    let bestScore = 0
    let bestEntry: RawEntry | undefined
    for (const e of db) {
      const eTokens = tokens(e.name)
      const score = qTokens.filter((t) => eTokens.includes(t)).length
      if (score > bestScore) {
        bestScore = score
        bestEntry = e
      }
    }
    if (bestScore >= need) hit = bestEntry
  }

  if (!hit) return null
  return {
    matchedName: hit.name,
    imageUrls: hit.images.map((p) => `${IMG_BASE}/${p}`),
    instructions: hit.instructions ?? [],
    primaryMuscles: hit.primaryMuscles ?? [],
    secondaryMuscles: hit.secondaryMuscles ?? [],
  }
}
