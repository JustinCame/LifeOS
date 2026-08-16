# Handoff: Fitness → Workout section redesign (LifeOS)

## Overview

The Fitness tab becomes a real workout hub for **one** program — the PPLUL 5-day split already in `src/lib/pplul.ts`. Five things change:

1. **Activity heatmap → month calendar.** The 13-week GitHub-style grid is replaced by a month calendar (same shape as Health's `WeightHeatmap`) where a day lights up if a workout happened, tagged with the day type, tappable for detail.
2. **A big start dial** replaces the "+ Start a Workout" button. It knows what today's workout is from a fixed weekday schedule, and it switches between **Workout** and **Cardio** modes. Cardio is timed and logged from the dial — the standalone "+ Log cardio" button is gone.
3. **A fatigue tracker** — front/back anatomical body map shaded by per-muscle-group fatigue, derived automatically from recent set volume, with a ranked list beside it.
4. **A live workout session screen** that opens fully (over the tab bar) when you press Start: editable sets with RPE, per-exercise swap-for-alternative, and a full-screen rest timer after each logged set.
5. **An Exercises screen** — per-lift maxes, est-1RM trend, and full set history.

Sections on the main screen, top to bottom: **header → month calendar → start dial → fatigue → cardio (log + cardio calendar) → Exercises link → Recent**. Templates and the old cardio/history sections are gone from the top level; Recent and both cardio blocks are collapsible.

Target repo: **JustinCame/LifeOS** @ `main` (Vite + React 19 + TS + Tailwind v4 + Dexie).

## About the design files

`prototype/` is a **design reference in plain HTML + in-browser JSX**, not production code. Open `prototype/LifeOS Current (standalone).html` in a browser — it's fully self-contained and works offline. The multi-file version next to it is the editable source.

Two reasons not to lift it directly:

- It runs React via UMD + in-browser Babel with `window`-scoped globals, and mock data instead of Dexie.
- `los.css` is a hand-written stand-in for Tailwind utilities (the preview sandbox can't run Tailwind's browser compiler). **Your app has real Tailwind v4** — every class string in the prototype is a genuine Tailwind class that resolves against your existing `@theme` block, so use them as-is and ignore `los.css` except as a token reference.

Files that matter for this handoff:

| File | Contains |
| --- | --- |
| `los-fitness.jsx` | Fitness screen, `WorkoutCalendar`, `StartDial`, `FatigueCard` + `BodyFigure`, `CardioSection`, `CardioCalendar`, `RecentWorkouts` |
| `los-workout.jsx` | `WorkoutSession` (live session), `SwapSheet`, `RestTimer`, `SESSION_PLANS` |
| `los-exercises.jsx` | `ExercisesScreen`, `ExerciseDetail`, `TrendChart`, `Sparkline` |
| `vendor/body-muscles-data.js` | extracted path data from the `body-muscles` npm package (see Fatigue below) |

**Fidelity: high.** Layout, spacing, type scale, radii and interaction behavior are final.

---

## 1. Month calendar (replaces `ActivityHeatmap` on Fitness)

Keep `ActivityHeatmap.tsx` if it's used elsewhere; on Fitness, render a month grid instead.

- 7-column grid, leading blanks for the first weekday, `aspect-square` cells, `rounded-[6px]`, `gap-[3px]`, weekday header row `S M T W T F S`.
- **Lit** = a completed workout that day. Background intensity scales with set count:
  `color-mix(in oklab, var(--color-accent) ${Math.min(100, 45 + sets * 2.6)}%, var(--color-surface-2))`, text `text-[#0a160d]`.
- **Cardio-only day** = faint accent wash (`14%`), accent-fg text.
- Empty past day = `var(--color-surface-2)`; future = transparent with `text-subtle/40`.
- Day-type tag bottom-right, `text-[7px]`, from the workout name: `Ph / Pl / Lg / Up / Lo` (all five distinct — don't collapse Push/Pull to "P").
- Today gets `0 0 0 1.5px var(--color-border-strong)`; the selected day `…1.5px var(--color-fg)`.
- Month nav `‹ ›` in the header with the next-month button disabled at the current month; header meta = workouts that month.
- Tapping a day reveals a detail strip under the grid: name · weekday/date · sets · volume · duration, PR badge if any. Tapping a workout should open `WorkoutSheet` for that workout (the prototype only shows a `›` affordance).

## 2. Start dial

Replaces the start button. A 204px SVG ring (r=86, `strokeWidth` 10) with a filled accent circle button at `inset-[22px]`.

**Mode toggle** above it: `Workout | Cardio` pills.

### Workout mode

- Fixed weekday schedule: **Mon Push, Tue Pull, Wed Legs, Thu Upper, Fri Lower**; Sat/Sun have no lift → dial shows a "Rest" state (outlined, not filled) with a "Log anyway" action.
- Center: kicker (`Today`, or the weekday when swapped) / lift name at 26px / `7 exercises · ~62m` / action pill.
- Ring = workouts completed this week ÷ 5.
- Footer: `PPLUL · Day 1 · swap day` — "swap day" cycles the five lifts, then "back to today" resets.
- Pressing the circle opens the **workout session screen** (§4) and starts a workout in Dexie (`startWorkout` / `runTemplate` for that day's PPLUL template). On return, the dial reads **Resume** while a workout is active — reuse the existing `active` lookup (`completedAt === undefined`).

### Cardio mode

Two types, from `src/lib/cardio.ts` kinds: **Zone 2 (liss), 40 min** and **HIIT, 20 min**. Footer link "switch type" toggles them; "cancel" aborts a run without logging.

- **Zone 2**: press → counts down 40:00; ring drains across the whole session; the circle toggles **Pause / Resume** (ring drops to 0.5 opacity when paused).
- **HIIT**: 20:00 total sits in the middle. Press → runs a **90-second interval**: the ring drains over those 90s while the total ticks down. When the interval ends, everything freezes and the action reads **Next 90s** ("Rest — tap for next") until pressed again. Repeat until the 20 min are used. Footer shows `90s intervals · N left`.
- When either timer reaches 0, write a `CardioSession` (`kind`, `modality`, `date: startOfDay`, `durationMin`) via the existing cardio helpers. It must appear immediately in the cardio list, the cardio calendar, and the weekly Z2/HIIT counts.
- Consider persisting an in-progress timer (start timestamp in Dexie or `localStorage`) so a backgrounded phone doesn't lose it — the prototype keeps it in component state only.

## 3. Fatigue tracker

Two body figures side by side (front + back) with a compact ranked list on the right: `Chest 48%` rows, no bars. Tapping a muscle region **or** a list row selects that group and reveals a footer line: `Chest · 48% · recovers in ~2d`. Section meta shows average fatigue of the top 4, or "fresh".

### Anatomy source

Use the **`body-muscles`** npm package (Apache-2.0, zero deps) that's already installed. **Ignore its `BodyChart` class** (vanilla DOM). Import the data and render it in your own JSX:

```ts
import { FRONT_MUSCLES, BACK_MUSCLES } from 'body-muscles'
```

- viewBox: front `"0 0 35 93"`, back `"37 0 35 93"`.
- Each entry is `{ id, name, path, view }` — render `<path d={m.path} …>`, `strokeWidth` `0.12` (`0.32` when selected), stroke `--color-border-strong` (`--color-fg` when selected).
- Fill for a fatigued group:
  `color-mix(in oklab, var(--color-accent) ${16 + pct * 0.74}%, var(--color-surface-2))`; unfatigued: `color-mix(in oklab, var(--color-fg) 7%, var(--color-surface-2))`.
- Structural regions (head, face, neck, hands, feet, knees, elbows, nape, **spine**) map to no group: neutral fill `color-mix(in oklab, var(--color-surface-2) 70%, transparent)`, not tappable. Note `spine` is deliberately excluded so only the erector/QL regions light up as "Lower back".
- Id → group mapping (`bmGroup` in `los-fitness.jsx`): `chest*`→chest, `shoulder*|deltoid*`→shoulders, `traps*`→traps, `lats*`→back, `biceps*`→biceps, `triceps*`→triceps, `forearm*`→forearms, `abs*|serratus*`→core, `obliques*`→obliques, `quads*|hip-flexor*|adductors*`→quads, `hamstrings*`→hamstrings, `gluteus*`→glutes, `calves*|tibialis*`→calves, `lower-back*`→lowerback.

### Fatigue model (prototype version — tune as you like)

Per workout in the last 5 days: `decay = max(0, 1 - daysAgo / 5.5)`, `perGroup = (sets / groupCount) * decay`, accumulated per muscle group of that workout, then `pct = min(100, round(acc / 12 * 100))`. Spillover: chest/shoulder work adds 25% to core, back adds 55% to traps, biceps adds 50% to forearms, quads adds 35% to calves. Rows below 8% are hidden from the list. Recovery estimate = `ceil(pct / 25)` days.

In the real app, derive `sets` and muscle groups per workout from `workout.exercises` + the `exercises` library (`muscleGroups`), the same way `WorkoutRow` already computes its group tags.

## 4. Live workout session screen

Opens **fully** — `absolute inset-0 z-50`, above the tab bar and chat dock. Not a drag-down sheet. (In the app this can be a route/screen rather than an overlay, as long as it covers everything and has no drag handle.)

- **Header**: `{lift} day`, then `elapsed · doneSets/totalSets sets · volume lb · RPE 8.0` (avg RPE of rated sets). `Finish` (accent) + `✕`. A 2px accent progress bar under the header tracks sets completed.
- **Exercise card** per exercise: name (dimmed + check when all sets are done), meta `Barbell · 4×5-7 · 180s rest`, and a `⇄ Swap` button.
- **Set rows**: column legend (`set · lb · reps · rpe`), then per set: index, weight input (`w-20`), `×`, reps input (`w-[56px]`), RPE input (`w-[52px]`, 5–10 step 0.5, placeholder `—`), and a log checkbox (`h-7 w-7`, `border-[1.5px]`, accent when done). Weight/reps prefill from the prescription.
- **Swap**: bottom sheet (`rounded-t-[28px]`, standard sheet chrome) listing 3 alternatives for that slot; picking one replaces the exercise, keeps sets/rep target, and the card notes `swapped from {original}`. The original becomes an option so it can be swapped back. In the app, source alternatives from the exercise library filtered by shared muscle groups + equipment, or add an `alternatives?: number[]` field to `Exercise`.
- **Rest timer**: logging a set opens a full-screen countdown (`inset-0 z-50`, `bg-bg/95 backdrop-blur-xl`) — 248px ring, mm:ss at 46px, exercise name, next-set line, and **−30s / +30s / Skip rest**. Uses the exercise's prescribed rest; auto-dismisses at zero. Un-logging a set does not open it.
- `SESSION_PLANS` in the prototype carries all five days with sets, rep ranges, rest, starting weights and alternatives — in the app this comes from the PPLUL template plus last-session weights.

## 5. Exercises screen

Reached from a card above Recent (`Exercises — maxes · weight trends · per-lift history`); pushed screen with a `‹ Fitness` back link.

- Filter chips: `All / Chest / Back / Shoulders / Arms / Legs / Core` (Arms = biceps+triceps, Legs = quads/hams/glutes/calves).
- Row: name, `equipment · last-done date`, a 56×20 sparkline of est 1RM, est 1RM value, and all-time delta (`+53`).
- **Detail**: title + equipment/muscle tags; **Maxes** card with three tiles (Est 1RM + all-time gain, Heaviest set + reps, Most reps + total volume); **Weight trend** card with an est-1RM line chart (accent line, `accent-soft` area fill, dot per session, low/peak labels); **History** listing each session — date, est 1RM, PR badge, and every set as a `weight×reps` chip.
- est 1RM = `w * (1 + r / 30)` (Epley) on the best set of each session. In the app, build these from `db.workouts` grouped by `exerciseId` — no new tables needed.

---

## Suggested build order

1. `WorkoutCalendar` on Fitness (replace `ActivityHeatmap` usage), wired to real workouts + cardio sessions.
2. `StartDial` — workout mode first (schedule → template → `startWorkout`), then cardio timers + logging.
3. Live session screen (`WorkoutSession`, `SwapSheet`, `RestTimer`), including RPE on `WorkoutSet` if it isn't there yet.
4. Fatigue card (`body-muscles` + fatigue derivation from workouts/exercise library).
5. Cardio section: collapsible log + `CardioCalendar`.
6. Exercises screen + detail, derived from workout history.
7. Collapse behavior + section order cleanup; drop Templates from the Fitness top level (keep template running available from the dial/program).

## Intentionally left open

- Where the PPLUL program is *edited* (the dial assumes the templates exist; installing/reinstalling PPLUL still lives wherever you keep it).
- Whether the session screen is a route or an overlay, and whether Finish prompts for a note.
- Alternatives data source (library query vs. explicit field), and whether swaps persist back to the template.
- Cardio timer persistence across app backgrounding, and whether Zone 2 should support GPS/HR.
- Whether tapping a calendar day opens `WorkoutSheet` read-only or editable.
- Fatigue tuning: decay window, spillover ratios, and whether user-rated soreness should override the volume estimate later.
