# LifeOS — Personal Life Management App

A PWA (Progressive Web App) that acts as a personal life operating system
powered by Claude AI. Seven tabs — Today, Calendar, Fitness, Macros,
Health, Habits, Notes — each with its own AI butler that sees only that
section's data, plus a passive-insight layer that watches for patterns
across everything you log and surfaces short observations inline where
you'd actually see them.

Built for one person, used daily on iPhone.

## The screens

**Today** — day-of-week header, next 7 days of calendar events, this
week's tasks, habit ring row, sleep/water/calorie stat tiles, "What did
you do today?" prompt with tag chips + freeform text, weekly review
button, settings row (notifications, calendars, backup, insight history,
workout program). Insights render at the top when the passive layer has
something specific to say.

**Calendar** — monthly grid with per-day colored event dots (matching
the calendar each event came from), tap-to-jump event list for the
selected day, and the daily journal entry above the events when one
exists. Backed by either the iCal or OAuth path (see Calendar below).

**Fitness** — WorkoutCalendar heatmap of the last 365 days, a StartDial
that surfaces today's scheduled lift or cardio (with in-line LISS + HIIT
timers), a FatigueCard with per-muscle-group heat computed
deterministically from the last 5 days' workouts, a Cardio weekly tile,
a Recent Workouts collapsible, a full Exercise library screen (list +
per-lift detail with history + PRs), and a Backlog tool for logging
past workouts and cardio sessions that didn't make it in on the day.

**Macros** — daily rings for calories/protein/carbs/fat with a
remaining-vs-eaten toggle, per-meal entries (breakfast/lunch/dinner/
snack), a Food library with per-serving macros and barcode scanning, a
Recipes sheet that lets you bundle library foods into a single logged
entry, and Quick Add for one-off foods you don't want to save.

**Health** — daily metrics (weight / sleep / water / mood / energy) with
14-day sparklines, streak counters, and a per-metric detail sheet.
Sleep entry uses bedtime + wake-time pickers rather than raw hours;
duration is derived and stored. A separate month-grid Weight Calendar
visualizes every weigh-in with shade indicating heavier vs lighter than
the month's average.

**Habits** — daily-habit tracking with rolling streak dots + longest-
streak record, plus a Goals inner panel for active/completed goals
organized by term (short / mid / long). Each goal has a description,
optional target date with relative copy ("3 weeks left" / "overdue"),
a progress slider, and a per-goal journal.

**Notes** — freeform title + body notes with search (title + body
substring, live), sort toggle (Recent / Created / A-Z), a filter row
of 12 tag chips (shared palette with the daily journal), pin toggle
per note (pinned rise to the top), and a soft-delete Archive with a
collapsible section at the bottom for restore or permanent delete.

## AI layer

**Five conversational butlers**, one per data-owning section, reachable
from the chat dock on any screen. Each sees only its own domain's data
and can take real actions rather than just giving advice.

- **Alfred (Today)** — cross-cutting view of calendar + tasks + habits
  + metrics + macros + goals. Manages calendar events (create / edit /
  delete) through Google Calendar.
- **Jarvis (Fitness)** — starts a workout, adds exercises, logs sets,
  finishes the workout, all from chat. Reacts to your logged sets and
  suggests weight increments from history.
- **Sebastian (Macros)** — logs meals conversationally ("two eggs and
  oatmeal for breakfast"), pulls macros from your food library, asks
  before logging unknown foods rather than guessing.
- **Cornelius (Health)** — sleep, weight, mood, energy, water. Quotes
  specific dates and looks for cross-metric patterns.
- **Benson (Goals)** — sees all active goals and journal entries;
  helps reflect and plan next steps.

Models are picked per coach based on the work — Sonnet 4.6 with
adaptive thinking for the coaches doing comparison + numeric reasoning,
Haiku 4.5 for the lighter ones. Butlers can also answer general
knowledge and off-topic questions; the hard rule is they never
fabricate data about you.

**Passive insight layer** — deterministic TypeScript decides when to
speak; the model only decides what to say. Every model call is guarded
by an SHA-256 input hash + a per-day budget cap so the same slice of
data never re-fires an insight. Cards render inline where relevant
(Home top, Macros header, Fitness top, below FatigueCard), never behind
a chat. Currently 8 triggers ship:

- `macro_gap` — after a meal entry, flag the largest macro deficit and
  suggest a food from your library that closes it.
- `food_sanity` — catch data-entry errors on new foods (calories
  don't match `4p+4c+9f`, kcal/gram above pure fat, etc).
- `workout_verdict` — right after Finish, compare this session's top
  sets and volume against the previous session of the same template.
- `lift_stalled` — scheduled scan for exercises where the top weight
  hasn't moved in 3 sessions or reps declined 2 sessions in a row.
- `fatigue_interpret` — when a muscle group is above 80% fatigue AND
  the next programmed session hits it.
- `sleep_before_heavy` — two nights under 6.5h AND today programs a
  compound barbell lift.
- `tdee_drift` — after 14+ days of weight + macro logs, flag when
  implied TDEE drifts >10% from the configured calorie goal.
- `morning_brief` — once-a-day forward-looking digest of today's
  session, macro pace, sleep, and top fatigue groups. Also queued for
  the morning push cron.

Insight history is browsable from Home → Settings → Insight history —
grouped by day, filterable by coach and status, with a Restore action
to bring dismissed or accepted cards back to Home.

**Weekly review** — Sunday Sonnet-generated recap of the past 7 days
across every section (fitness, macros, health, habits, tasks, goals),
cached so re-opening doesn't re-spend tokens.

## Calendar integration

Two paths, either or both:

**iCal URLs** (recommended for read-only day-to-day use) — paste up to
5 Google Calendar iCal URLs from Home → Settings → Calendars. Each row
takes an optional label ("Personal", "SUNY", "Holidays") + one of three
color pips. Event dots on Home and the Calendar grid inherit their
source calendar's color, so overlapping days are easy to read. Accepts
the raw `.ics` URL, the public share URL, an `<iframe>` embed code, a
`webcal://` link, or a bare calendar ID — the app normalizes any of
them to the canonical form. Reads through a Vercel proxy since browsers
can't fetch `calendar.google.com` directly. No sign-in, no expiration.

**Google OAuth** (needed for write access) — sign in with Google and
Alfred can create / edit / delete events. Silent token refresh runs 5
minutes before expiry, though iOS Safari's storage partitioning makes
this unreliable on PWAs installed to home screen — hence the iCal path.

## Timers, notifications, and iOS

Every timer in the app (rest timer during a workout, WorkoutSession
elapsed clock, WorkoutSheet inline rest, StartDial cardio session +
HIIT interval) is derived from wall-clock timestamps rather than a
decrementing counter, so backgrounding the app doesn't freeze the
display. On return, everything catches up instantly via a shared
`useTick` hook that re-renders on `visibilitychange`.

Local notifications for timer completions are scheduled inside the
service worker (`self.setTimeout` + `showNotification`) rather than
from the page, since iOS suspends the page's JS immediately when
backgrounded but gives SWs a longer execution window. Not bulletproof
— Apple can and does suspend SW timers too — but short rest timers
and HIIT intervals now reliably fire on the lock screen.

Server-scheduled push notifications for the daily morning brief go
through a shared-secret `/api/queue-push` endpoint into Vercel KV; the
existing `/api/push` cron reads them out at 9am ET / 13:00 UTC. If
nothing was queued, the cron sends nothing at all (silence, not a
fallback nag).

## Everything else

**Backup & Restore** — Export the whole Dexie DB as JSON (paste into a
note or email it to yourself), re-import on another device. Sensitive
settings (Anthropic key, Google auth) are excluded. The Home tab's
Backup row shows "Last backed up X days ago" and highlights past 14
days.

**Section Exports** — Fitness, Health, and Macros each have an Export
button generating plain readable text you can paste to a coach.

**Push reminders** — Three legacy web-push crons (daily tracking nudge,
daily habit check-in, weekly backup reminder) plus the morning-brief
insight push described above.

**Build tag** — Bottom-right of the Today screen shows the deploy's
short git commit and build timestamp, so you can tell at a glance
whether the latest push has landed on your phone.

## Technical

- **React 19 + TypeScript 6 + Vite 8 + Tailwind v4**, single-chunk
  bundle. PWA with dark/light themes and mobile-first layout.
- **Dexie** (IndexedDB) holds all data locally. Schema at version 14
  with 21 tables including `insights` (the passive-layer store) and
  `daily_logs` (the journal).
- **Anthropic SDK** runs client-side with the user's own key (stored
  in Dexie). No server proxy for chat.
- **Tool use** — Alfred, Jarvis, and Sebastian invoke tools that hit
  Dexie directly. Loop runs up to 6 iterations per turn.
- **ical.js** for calendar parsing and RRULE expansion; Vercel
  serverless function (`api/ical.ts`) proxies feeds with a URL
  allowlist so it isn't a general-purpose open proxy.
- **Vercel serverless** (`api/push.ts`, `api/subscribe.ts`,
  `api/queue-push.ts`, `api/ical.ts`) + Vercel KV for push
  subscription state, queued morning briefs, and edge-cached iCal
  responses.
- **web-push + VAPID** for push delivery; service worker (`public/sw.js`)
  handles both real push events and local scheduled notifications.

## Setup

```bash
npm install
npm run dev      # local dev with HMR
npm run build    # production bundle to dist/
```

`.env.local` for local dev:

- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID for the Google Calendar
  fallback path (optional if you're only using iCal URLs).

The Anthropic API key is entered inside the app (Home → chat dock or
Insights setup) and stored in Dexie. Don't set `VITE_ANTHROPIC_API_KEY`
on Vercel — Vite bakes `VITE_*` env vars into the client bundle, which
would leak the key to anyone who inspects your JS.

Vercel env vars for production:

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` — VAPID
  keys for web-push
- `CRON_SECRET` — bearer secret Vercel Cron sends on cron requests
- `QUEUE_PUSH_SECRET` — bearer secret protecting `/api/queue-push`
  (mirror the same value into the app's `queue_push_secret` Dexie
  setting)
- `KV_*` — Vercel KV connection env vars (auto-populated when you
  attach a KV store to the project)

Deploy:

```bash
vercel --prod --yes
```

Git push does NOT auto-deploy — deployment is manual from the CLI so
that in-progress commits aren't accidentally pushed live.

## Status

Personal project. Built for one user, on one device, with hardcoded
assumptions (lb units, butler personas, US-style date formatting,
Eastern-time cron schedules, PPLUL as the default program) that
reflect that. Not designed to be multi-tenant, and there's no signup
flow — a fresh install lands you on an empty database.
