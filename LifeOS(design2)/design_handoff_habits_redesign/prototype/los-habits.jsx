// LifeOS — Habits tab (replaces Goals tab; goals live behind a segmented toggle)
const { useState: uSH, useRef: uRH, useEffect: uEH, useMemo: uMH } = React;

// ── habit model ──────────────────────────────────────────────────────
// kind: 'binary' | 'count' | 'duration' | 'avoid'
// schedule: { mode: 'daily' | 'weekdays' | 'perWeek', days?: number[], perWeek?: number }
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function makeHistory(days, pattern) {
  // pattern: fn(i) -> value ratio 0..1 or null (not scheduled)
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ date: T - i * DAY, r: pattern(i) });
  return out;
}

const HABITS_SEED = [
  {
    id: 1, name: "Read", kind: "count", target: 20, unit: "pages",
    schedule: { mode: "daily" }, today: 14,
    streak: 12, best: 21, consistency: 87,
    history: makeHistory(30, (i) => (i % 9 === 3 ? 0.4 : i % 7 === 5 ? 0 : 1)),
    notes: [
      { date: T - DAY, text: "Finished part two of Dawn of Everything" },
      { date: T - 4 * DAY, text: "Short session, fell asleep" },
    ],
  },
  {
    id: 2, name: "Meditate", kind: "duration", target: 10, unit: "min",
    schedule: { mode: "daily" }, today: 10,
    streak: 7, best: 19, consistency: 73,
    history: makeHistory(30, (i) => (i % 5 === 2 ? 0 : i % 8 === 6 ? 0.6 : 1)),
    notes: [{ date: T, text: "Calm, 10 min body scan" }],
  },
  {
    id: 3, name: "Stretch", kind: "duration", target: 15, unit: "min",
    schedule: { mode: "weekdays", days: [1, 3, 5] }, today: 0,
    streak: 3, best: 11, consistency: 54,
    history: makeHistory(30, (i) => {
      const dow = new Date(T - i * DAY).getDay();
      if (![1, 3, 5].includes(dow)) return null;
      return i % 4 === 1 ? 0 : 1;
    }),
    notes: [],
  },
  {
    id: 4, name: "No phone in bed", kind: "avoid",
    schedule: { mode: "daily" }, today: 1,
    streak: 21, best: 21, consistency: 94,
    history: makeHistory(30, (i) => (i === 12 ? 0 : 1)),
    notes: [{ date: T - 12 * DAY, text: "Scrolled until 1am. Reset." }],
  },
  {
    id: 5, name: "Cold plunge", kind: "binary",
    schedule: { mode: "perWeek", perWeek: 3 }, today: 0,
    streak: 2, best: 6, consistency: 62,
    history: makeHistory(30, (i) => (i % 3 === 0 ? 1 : null)),
    notes: [],
  },
];

function scheduleLabel(h) {
  const s = h.schedule;
  if (s.mode === "daily") return "every day";
  if (s.mode === "weekdays") return s.days.map((d) => WEEKDAY_LABELS[d]).join(" ");
  return `${s.perWeek}× per week`;
}
function targetLabel(h) {
  if (h.kind === "binary") return "done or not";
  if (h.kind === "avoid") return "avoid";
  return `${h.target} ${h.unit}`;
}
function progressOf(h) {
  if (h.kind === "binary" || h.kind === "avoid") return h.today ? 1 : 0;
  return Math.min(1, h.today / h.target);
}
function valueLabel(h) {
  if (h.kind === "avoid") return h.today ? "kept" : "broken";
  if (h.kind === "binary") return h.today ? "done" : "—";
  return `${h.today}`;
}
function isScheduledToday(h) {
  const s = h.schedule;
  if (s.mode === "daily") return true;
  if (s.mode === "weekdays") return s.days.includes(new Date().getDay());
  return true;
}

// ── drag ring ────────────────────────────────────────────────────────
// Drag anywhere on the ring to set the value. Tap toggles binary/avoid.
function DragRing({ habit, size = 84, stroke = 7, onChange, showValue = true, interactive = true }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = progressOf(habit);
  const ref = uRH(null);
  const [dragging, setDragging] = uSH(false);
  const isToggle = habit.kind === "binary" || habit.kind === "avoid";

  const valueFromEvent = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const ratio = deg / 360;
    const steps = habit.kind === "duration" ? habit.target : habit.target;
    return Math.max(0, Math.min(steps, Math.round(ratio * steps)));
  };

  const onDown = (e) => {
    if (!interactive) return;
    if (isToggle) { onChange(habit.today ? 0 : 1); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(valueFromEvent(e));
  };
  const onMove = (e) => { if (dragging && !isToggle) onChange(valueFromEvent(e)); };
  const onUp = () => setDragging(false);

  const broken = habit.kind === "avoid" && !habit.today;
  const ringColor = broken ? "var(--color-subtle)" : "var(--color-accent)";

  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      className={`relative flex-shrink-0 select-none ${interactive ? (isToggle ? "cursor-pointer" : "cursor-grab active:cursor-grabbing") : ""}`}
      style={{ width: size, height: size, touchAction: "none" }}>
      <svg width={size} height={size} className="block -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: dragging ? "none" : "stroke-dasharray .18s ease" }} />
      </svg>
      {showValue && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            {isToggle ? (
              <span className={`font-mono ${broken ? "text-subtle" : habit.today ? "text-accent-fg" : "text-subtle"}`} style={{ fontSize: size * 0.17 }}>
                {valueLabel(habit)}
              </span>
            ) : (
              <React.Fragment>
                <div className="font-mono text-fg" style={{ fontSize: size * 0.27, letterSpacing: "-0.02em" }}>{habit.today}</div>
                <div className="mt-0.5 font-mono text-subtle" style={{ fontSize: size * 0.11 }}>/ {habit.target}</div>
              </React.Fragment>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 30-day heatmap ───────────────────────────────────────────────────
function HabitHeatmap({ history, cell = 9, gap = 3, cols = 15 }) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
      {history.map((d, i) => {
        let bg = "var(--color-surface-2)", op = 1, ring = "none";
        if (d.r === null) { bg = "transparent"; ring = "inset 0 0 0 1px var(--color-border)"; }
        else if (d.r > 0) bg = `color-mix(in oklab, var(--color-accent) ${35 + d.r * 65}%, transparent)`;
        const isToday = i === history.length - 1;
        return (
          <span key={i} title={new Date(d.date).toLocaleDateString()} className="rounded-[2px]"
            style={{ width: cell, height: cell, background: bg, opacity: op, boxShadow: isToday ? "0 0 0 1.5px var(--color-accent-soft), 0 0 0 2.5px var(--color-bg)" : ring }} />
        );
      })}
    </div>
  );
}

// ── habit card ───────────────────────────────────────────────────────
function HabitCard({ habit, onChange, onOpen }) {
  const scheduled = isScheduledToday(habit);
  const broken = habit.kind === "avoid" && !habit.today;
  return (
    <div className={`mb-2.5 overflow-hidden rounded-[16px] border bg-surface ${scheduled ? "border-border" : "border-border/50"}`}>
      <div className="flex gap-3.5 px-3.5 pb-3 pt-3.5">
        <DragRing habit={habit} onChange={onChange} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-base leading-tight text-fg">{habit.name}</div>
            {!scheduled && <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">rest day</span>}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {targetLabel(habit)} · {scheduleLabel(habit)}
          </div>
          <div className="mt-2.5">
            <HabitHeatmap history={habit.history} />
          </div>
        </div>
      </div>
      <button onClick={onOpen} className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left hover:bg-surface-2">
        <span className={`whitespace-nowrap font-mono text-xs ${habit.streak >= 7 ? "text-accent-fg" : "text-muted"}`}>{habit.streak}d streak</span>
        <span className="font-mono text-xs text-subtle">·</span>
        <span className="whitespace-nowrap font-mono text-xs text-muted">{habit.consistency}%</span>
        <span className="font-mono text-xs text-subtle">·</span>
        <span className="whitespace-nowrap font-mono text-xs text-subtle">best {habit.best}d</span>
        {broken && <span className="ml-auto whitespace-nowrap rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">broken today</span>}
        {!broken && <span className="ml-auto text-subtle">›</span>}
      </button>
    </div>
  );
}

// ── screen ───────────────────────────────────────────────────────────
function HabitsScreen({ habits, setHabits, onOpenHabit }) {
  const [view, setView] = uSH("habits");
  const doneCount = habits.filter((h) => progressOf(h) >= 1).length;
  const scheduledCount = habits.filter(isScheduledToday).length;
  const avgConsistency = Math.round(habits.reduce((s, h) => s + h.consistency, 0) / habits.length);

  const setValue = (id, v) => setHabits(habits.map((h) => (h.id === id ? { ...h, today: v } : h)));

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            {view === "habits" ? "Habits" : "Goals"}
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {view === "habits"
              ? `${doneCount}/${scheduledCount} today · ${avgConsistency}% this month`
              : `${MOCK.goals.filter((g) => g.status !== "completed").length} active · ${MOCK.goals.filter((g) => g.status === "completed").length} completed`}
          </div>
        </header>

        <div className="mb-3.5 flex gap-1 rounded-full border border-border bg-surface p-1">
          {[["habits", "Habits"], ["goals", "Goals"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${view === k ? "bg-accent text-[#0a160d]" : "text-muted hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>

        {view === "habits" ? (
          <React.Fragment>
            {habits.map((h) => (
              <HabitCard key={h.id} habit={h} onChange={(v) => setValue(h.id, v)} onOpen={() => onOpenHabit(h.id)} />
            ))}
            <button className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]">
              <PlusIcon14 /> New habit
            </button>
            <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
              drag a ring to log · tap the footer for detail
            </div>
          </React.Fragment>
        ) : (
          <GoalsPanel />
        )}
      </div>
    </div>
  );
}

function GoalsPanel() {
  const goals = MOCK.goals;
  const active = goals.filter((g) => g.status !== "completed");
  const completed = goals.filter((g) => g.status === "completed");
  return (
    <React.Fragment>
      <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-accent-fg hover:border-border-strong active:scale-[0.99]">
        <PlusIcon14 /> New goal
      </button>
      {["short", "mid", "long"].map((term) => {
        const list = active.filter((g) => g.term === term);
        const labels = { short: "Short-term", mid: "Mid-term", long: "Long-term" };
        return (
          <Section key={term} title={labels[term]} meta={list.length ? `${list.length}` : ""}>
            <Card>
              {list.length === 0
                ? <div className="px-3.5 py-3 text-sm text-muted">No {term === "mid" ? "mid-term" : term + "-term"} goals.</div>
                : list.map((g) => <GoalRow key={g.id} goal={g} />)}
            </Card>
          </Section>
        );
      })}
      {completed.length > 0 && (
        <Section title="Completed" meta={`${completed.length}`}>
          <Card>{completed.map((g) => <GoalRow key={g.id} goal={g} />)}</Card>
        </Section>
      )}
    </React.Fragment>
  );
}

Object.assign(window, {
  HABITS_SEED, HabitsScreen, HabitCard, DragRing, HabitHeatmap,
  scheduleLabel, targetLabel, progressOf, valueLabel, isScheduledToday, WEEKDAY_LABELS,
});
