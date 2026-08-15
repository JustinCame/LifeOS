# Handoff: Habits redesign (LifeOS)

## Overview

Habits are being promoted out of the Today screen into their own first-class tab. The existing **Goals** tab becomes a **Habits** tab, with goals demoted to a segmented toggle at the top of that same screen. The habit model itself is substantially expanded: four habit kinds, three scheduling modes, drag-to-log rings, streak + 30-day consistency, and a full per-habit detail screen.

Target repo: **JustinCame/LifeOS** @ `main` (Vite + React 19 + TS + Tailwind v4 + Dexie).

## About the design files

Everything in `prototype/` is a **design reference written in plain HTML/JSX-in-browser**. It is not production code and should not be copied into `src/`. It exists so you can see and interact with the intended result.

Two specific reasons not to lift it directly:

- It runs React via UMD + in-browser Babel with `window`-scoped globals. Your app is a real Vite/TS build.
- `los.css` is a hand-written stand-in for Tailwind utilities, written only because the preview sandbox couldn't run Tailwind's browser compiler. **Your app already has real Tailwind v4** — use ordinary utility classes and delete nothing from `src/index.css`. Ignore `los.css` entirely except as a reference for token values (which are already identical to yours).

The task is to recreate these screens in the existing codebase using its established patterns: Dexie tables via `useLiveQuery`, the primitives in `src/components/primitives.tsx`, the `@theme` tokens in `src/index.css`, and sheet components under `src/components/`.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, and interaction behavior are final and were built from your own tokens. Recreate pixel-for-pixel. Every class string in the prototype is a real Tailwind v4 class that resolves against your existing `@theme` block.

---

## Data model changes

### New `Habit` shape

The current `Habit` type (`src/db/types.ts`) is roughly `{ name, frequency, streak, longestStreak, history: number[], lastCompleted, createdAt }`. `history` as a flat array of completion timestamps can't express partial progress, so it needs to carry a value per day.

```ts
export type HabitKind = 'binary' | 'count' | 'duration' | 'avoid'

export type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }   // 0=Sun … 6=Sat
  | { mode: 'perWeek'; perWeek: number }   // 1–7

export interface Habit {
  id?: number
  name: string
  kind: HabitKind
  target?: number          // count/duration only
  unit?: string            // 'pages', 'min', … count/duration only
  schedule: HabitSchedule
  streak: number
  longestStreak: number
  createdAt: number
  archivedAt?: number
}

// One row per habit per day. Replaces the `history: number[]` array.
export interface HabitEntry {
  id?: number
  habitId: number
  date: number             // startOfDay ms
  value: number            // count/duration: amount. binary/avoid: 0 | 1
  target: number           // target at time of logging, so history stays honest
  note?: string
  createdAt: number
}
```

**Dexie migration.** Bump the version and add a store. Existing `history: number[]` entries migrate to `HabitEntry` rows with `value: 1, target: 1`, and existing habits default to `kind: 'binary'`, `schedule: { mode: 'daily' }`.

```ts
db.version(N).stores({
  habits: '++id, name, createdAt, archivedAt',
  habit_entries: '++id, habitId, date, [habitId+date]',
}).upgrade(async (tx) => {
  const habits = await tx.table('habits').toArray()
  for (const h of habits) {
    for (const ts of (h.history ?? [])) {
      await tx.table('habit_entries').add({
        habitId: h.id, date: startOfDay(ts), value: 1, target: 1, createdAt: ts,
      })
    }
    await tx.table('habits').update(h.id, {
      kind: 'binary', schedule: { mode: 'daily' }, history: undefined, frequency: undefined,
    })
  }
})
```

The `[habitId+date]` compound index is what makes the per-day upsert cheap — mirror the `[date+type]` pattern already used in `health_logs`.

### Derived values — put these in a new `src/lib/habits.ts`

```ts
progressOf(habit, entry)      // 0..1 — binary/avoid: value?1:0; else min(1, value/target)
isScheduledToday(habit)       // daily → true; weekdays → days.includes(getDay()); perWeek → true
computeStreak(habit, entries) // consecutive scheduled days where progress >= 1, walking back
consistency(habit, entries, 30) // hit scheduled days / total scheduled days in window, as %
scheduleLabel(habit)          // 'every day' | 'M W F' | '3× per week'
targetLabel(habit)            // 'done or not' | 'avoid' | '20 pages'
```

Streak rules, decided:

- Only **scheduled** days count. A rest day (not in `weekdays`) is skipped, never a miss.
- `perWeek` habits evaluate by ISO week: the week is hit once `perWeek` entries exist, and the streak counts consecutive hit weeks.
- `avoid` habits invert: a day with no entry counts as **kept**, and an entry with `value: 0` is an explicit break. This matters — do not treat "no data" as a miss for avoidance habits.
- Consistency is a plain percentage over the trailing 30 days, no forgiveness/freeze logic.

---

## Screens

### 1. Today (`src/screens/Home.tsx`) — remove the habits card

Delete the entire `<Section title="Habits">` block, the `habitDraft` state, `addHabit`, `toggleHabitToday`, `deleteHabit`, `isDoneToday`, and `getHistoryDots`.

Replace it, in the same position (after Tasks, before Today's stats), with a single ring row:

**`HabitRingRow`** — one `<Section title="Habits" meta="{done}/{scheduled} today">` wrapping one full-width button.

- Button: `flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3.5 text-left hover:border-border-strong active:scale-[0.99]`
- Inside: `flex flex-1 items-center gap-3`, one 34×34 ring per habit **scheduled today** (unscheduled habits are omitted, not dimmed).
- Ring: `<svg width=34 height=34>` rotated `-rotate-90`; track `circle r=15 stroke=var(--color-surface-2) strokeWidth=3`; progress arc same geometry, `stroke=var(--color-accent)` (or `var(--color-subtle)` when an `avoid` habit is broken), `strokeLinecap="round"`, `strokeDasharray={`${2π·15·pct} ${2π·15}`}`.
- At 100%: a centered 10×10 check glyph in `text-accent-fg`, absolutely positioned over the ring.
- No habit names anywhere in this row — that was deliberate; the row is a glance, not a list.
- Trailing `<span className="text-subtle">›</span>`, tapping navigates to the Habits tab.

Update the footer line from `{tasks.length} tasks · {habits.length} habits` — habits count can stay or go, your call.

### 2. Habits tab (replaces `src/screens/Goals.tsx` as the routed screen)

Create `src/screens/Habits.tsx`. Keep `Goals.tsx`'s row rendering — extract its list body into a `GoalsPanel` component (or import `GoalRow` from it) and render that when the toggle is on Goals.

**App wiring** (`src/App.tsx`):
- `Tab` type: replace `"goals"` with `"habits"`.
- `tabToCoachKey`: `case "habits": return "goals"` — the coach stays **Benson**, so the chat dock placeholder on this tab is unchanged.
- Tab bar: label `Habits`, and swap `TargetIcon` for a ring icon:
  ```tsx
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35"/>
    <path d="M10 3.5a6.5 6.5 0 0 1 5.6 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="10" cy="10" r="1.6" fill="currentColor"/>
  </svg>
  ```

**Header.** Standard screen header: `h1` is `text-2xl font-medium leading-[1.05] tracking-[-0.025em]`, reading `Habits` or `Goals` depending on the toggle. Sub-line `mt-1.5 font-mono text-xs tracking-[0.02em] text-muted`:
- Habits view: `{done}/{scheduledToday} today · {avgConsistency}% this month`
- Goals view: `{active} active · {completed} completed`

**Segmented toggle.** Directly under the header, `mb-3.5`:
```tsx
<div className="mb-3.5 flex gap-1 rounded-full border border-border bg-surface p-1">
  {/* each: flex-1 rounded-full py-1.5 text-sm font-medium transition */}
  {/* active:   bg-accent text-[#0a160d] */}
  {/* inactive: text-muted hover:text-fg */}
</div>
```
State is local `useState<'habits'|'goals'>('habits')` — not persisted, not in the URL.

**Habit card.** One card per habit, `mb-2.5 overflow-hidden rounded-[16px] border bg-surface`, border `border-border` normally and `border-border/50` when not scheduled today.

Upper region `flex gap-3.5 px-3.5 pb-3 pt-3.5`:
- Left: 84×84 drag ring, `stroke=7`, `flex-shrink-0`.
  - Center readout for count/duration: value at `fontSize: size*0.27`, `letter-spacing:-0.02em`, `text-fg`, with `/ {target}` beneath at `size*0.11` in `text-subtle`.
  - Center readout for binary/avoid: the word `done` / `—` / `kept` / `broken` at `size*0.17`, `text-accent-fg` when satisfied else `text-subtle`.
- Right (`min-w-0 flex-1`):
  - Name row: `truncate text-base leading-tight text-fg`; when not scheduled today, a right-aligned `font-mono text-[10px] uppercase tracking-[0.06em] text-subtle` reading `rest day`.
  - Meta: `mt-0.5 font-mono text-[11px] text-muted` → `{targetLabel} · {scheduleLabel}`.
  - `mt-2.5` 30-day heatmap: 15 columns × 2 rows, 9px cells, 3px gap.

Footer strip — a button that opens the detail screen: `flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left hover:bg-surface-2`. Contents, each `whitespace-nowrap font-mono text-xs` (the nowrap matters — without it "7d streak" wraps at 390px):
`{streak}d streak` (`text-accent-fg` at ≥7 else `text-muted`) · `·` · `{consistency}%` · `·` · `best {best}d`, then `ml-auto` either `›` or, for a broken avoid habit, a `rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle` chip reading `broken today`.

Below the list: a full-width `+ New habit` primary button (`rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]`), then a centered hint `py-3 font-mono text-[11px] tracking-[0.04em] text-subtle` reading `drag a ring to log · tap the footer for detail`.

### 3. Habit detail (`src/components/HabitDetailScreen.tsx` or `src/screens/HabitDetail.tsx`)

Full-screen push over the Habits tab — **not** a bottom sheet, so it reads as navigation rather than a modal.

Container: `absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300`, translating `translate-x-full` → `translate-x-0`, easing `cubic-bezier(0.32, 0.72, 0.2, 1)`. Mount with a `requestAnimationFrame` flip and delay unmount ~260ms on close, matching the existing pattern in `src/screens/Chat.tsx`.

Scroll body: `flex-1 overflow-y-auto px-[18px] pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden`. Note `pb-[40px]`, not the usual `pb-[160px]` — the tab bar and chat dock are covered by this screen.

Sections top to bottom:

1. **Nav row** — back button `-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg` with a chevron and the word `Habits`; right side an `Edit` button styled like the existing Export buttons (`rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle`).
2. **Header** — habit name as `h1`, sub-line `{kindLabel} · {targetLabel} · {scheduleLabel}` where kindLabel ∈ `Yes / no`, `Count`, `Duration`, `Avoidance`.
3. **Big ring card** — `flex flex-col items-center rounded-[16px] border border-border bg-surface px-3.5 py-6`. Ring at **168px, stroke 12**. Beneath it a `mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-subtle` hint: `drag around the ring to log`, or `tap to toggle` for binary/avoid. For count/duration only, a `mt-3 flex gap-2` row of `−1` `+1` `+5` (`rounded-[10px] border border-border bg-bg px-3.5 py-1.5 font-mono text-sm`) plus a filled `done` button that jumps to target.
4. **Streak** — 4-cell grid, `grid grid-cols-4 overflow-hidden rounded-[16px] border border-border bg-surface`, each cell `flex flex-col gap-1 border-l border-border px-3 py-3.5 first:border-l-0` with an `text-xs uppercase tracking-[0.04em] text-muted` label over a `font-mono text-[16.5px] tracking-[-0.01em]` value. Cells: `current` `{streak}d`, `best` `{best}d`, `30-day` `{consistency}%`, `hit` `{hit}/{scheduled}`. `current` and `30-day` go `text-accent-fg` at ≥7d and ≥80% respectively.
5. **Last 12 weeks** — 84-cell heatmap, 12 columns, 11px cells, inside `rounded-[16px] border border-border bg-surface px-3.5 py-3.5`. Section meta shows `{n} partial`. Below, a `mt-3 flex items-center gap-3 font-mono text-[10px] text-subtle` legend: missed / partial / hit / rest, each with a 8×8 swatch.
6. **Schedule** — inside a `Card`. Label `repeats` (`font-mono text-[11px] uppercase tracking-[0.06em] text-muted`), then three mode buttons `flex-1 rounded-[8px] px-2 py-1.5 text-xs font-medium` — active `bg-accent-soft text-accent-fg`, inactive `border border-border bg-bg text-subtle`. When mode is `weekdays`, a 7-across row of day toggles (`grid h-8 flex-1 place-items-center rounded-[8px] text-xs font-medium`, on = `bg-accent text-[#0a160d]`). When `perWeek`, a 1–7 row of the same shape with `font-mono`. Below, for count/duration, a bordered row with `Daily target` and a numeric input (`w-20 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm`).
7. **Notes** — a `Card` listing entries that have a note, newest first: date line `font-mono text-[11px] text-subtle` (`weekday, month day`) over `mt-1 text-base leading-snug text-fg`. Footer uses the existing `Input` primitive with placeholder `Add a note for today`, writing to today's `HabitEntry.note`.
8. **Danger zone** — a `Card` with `Archive habit` then `Delete habit and history` (the latter `text-subtle hover:text-fg`), both full-width left-aligned `px-3.5 py-3 text-base`.

### 4. Heatmap component (`src/components/HabitHeatmap.tsx`)

Shared by the card (30 days, 15 cols, 9px) and the detail screen (84 days, 12 cols, 11px). Props: `entries`, `days`, `cols`, `cell`, `gap`.

Per-cell background, matching the convention already used in `ActivityHeatmap`/`WeightHeatmap`:

| Day state | Background |
| --- | --- |
| Not scheduled (rest) | `transparent` + `box-shadow: inset 0 0 0 1px var(--color-border)` |
| Scheduled, no progress | `var(--color-surface-2)` |
| Partial (0 < r < 1) | `color-mix(in oklab, var(--color-accent) {35 + r*65}%, transparent)` |
| Hit (r ≥ 1) | effectively `var(--color-accent)` from the same formula |

Cells are `rounded-[2px]`, and today's cell gets `box-shadow: 0 0 0 1.5px var(--color-accent-soft), 0 0 0 2.5px var(--color-bg)` — the same double-ring treatment the old 7-dot row used.

---

## The drag ring

The one genuinely novel interaction. `src/components/DragRing.tsx`.

```tsx
// Container: position:relative, width/height = size, touchAction: 'none'
// (touchAction none is required or mobile Safari scrolls instead of dragging)

const valueFromEvent = (e: React.PointerEvent) => {
  const rect = ref.current!.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  let deg = (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI
  if (deg < 0) deg += 360
  return Math.max(0, Math.min(target, Math.round((deg / 360) * target)))
}
```

`atan2(dx, -dy)` puts 0° at 12 o'clock and increases clockwise, which matches the `-rotate-90` SVG. Handlers:

- `onPointerDown` — for `binary`/`avoid`, toggle and return early. Otherwise `setPointerCapture(e.pointerId)`, set dragging, and apply immediately so a tap on the ring also sets a value.
- `onPointerMove` — apply while dragging.
- `onPointerUp` / `onPointerCancel` — clear dragging.

Suppress the arc's `transition: stroke-dasharray .18s ease` while dragging, or the ring lags the finger. Restore it after, so programmatic changes (`+5`, `done`) animate.

Cursor: `cursor-grab active:cursor-grabbing` for draggable kinds, `cursor-pointer` for toggles.

Debounce the Dexie write — drag emits a lot of pointermove events. Keep the ring's displayed value in local state and flush to IndexedDB on pointerup (or trailing-debounce ~150ms).

**Accessibility.** The ring is currently pointer-only. Give it `role="slider"`, `aria-valuemin/max/now`, `aria-label={habit.name}`, `tabIndex={0}`, and arrow-key handlers (±1, and ±5 with shift). The `−1/+1/+5/done` buttons on the detail screen are the keyboard-accessible path for now; the cards are not, which is a real gap worth closing.

---

## Design tokens

No new tokens. Everything resolves against the existing `@theme` block in `src/index.css` — `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-fg`, `--color-muted`, `--color-subtle`, `--color-accent`, `--color-accent-soft`, `--color-accent-fg`, the `--text-*` ramp, and `--radius-*`. `#0a160d` is the existing on-accent text color, already used throughout for text on `bg-accent`.

The only non-token values introduced are geometric: ring sizes 34 / 84 / 168px with strokes 3 / 7 / 12, and heatmap cells 9px / 11px at 3px gap.

## Assets

None. Every icon is inline SVG, `currentColor`, `strokeWidth` 1.4–1.8 to match the existing set.

## Out of scope

Not designed, and worth confirming before you build past them:

- The **new-habit / edit-habit form**. The `+ New habit` and `Edit` buttons exist and are unwired. It needs kind, name, target, unit, and schedule — probably a `HabitSheet` following `GoalSheet.tsx`.
- Reordering habits.
- Archived-habits list.
- Whether Benson's system prompt in `src/lib/coaches.ts` should be fed the new habit data. It currently reads goals; with habits on the same screen it probably should read both.

## Files in `prototype/`

| File | What's in it |
| --- | --- |
| **`LifeOS Current (standalone).html`** | **Open this one.** Fully self-contained — works offline, double-click it |
| `LifeOS Current.html` | Same design, but needs a local web server (see below) |
| `los-habits.jsx` | **Habits screen, habit card, DragRing, HabitHeatmap, seed data** |
| `los-habit-detail.jsx` | **Habit detail screen** |
| `los-screens-1.jsx` | Today (with `HabitRingRow`), Calendar, chat sheet |
| `los-screens-2.jsx` | Fitness, Macros, Health, Goals, Notes |
| `los-primitives.jsx` | Ports of `primitives.tsx` + all mock data |
| `los-app.jsx` | Tab bar, routing, metric sheet, theme toggle |
| `los.css` | Hand-written utility stand-in — **ignore, you have real Tailwind** |
| `ios-frame.jsx` | Preview-only device bezel — not part of the app |

Files worth reading first: `los-habits.jsx`, then `los-habit-detail.jsx`.

### Opening the prototype

Double-click **`LifeOS Current (standalone).html`** — everything is inlined, no server needed.

The multi-file `LifeOS Current.html` will show a black screen if opened directly from disk: it loads the `.jsx` files over XHR, and a `file://` page has no origin, so the browser blocks them. Serve the folder instead if you want to edit the design and see changes:

```
cd design_handoff_habits_redesign/prototype
python3 -m http.server 8000
# then open http://localhost:8000/LifeOS%20Current.html
```
