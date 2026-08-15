// LifeOS — Fitness, Macros, Health, Goals, Notes
const { useState: uS2, useMemo: uM2 } = React;

// ── Fitness ──────────────────────────────────────────────────────────
function Fitness() {
  const [cardioExpanded, setCardioExpanded] = uS2(false);
  const workouts = MOCK.workouts, templates = MOCK.templates, cardio = MOCK.cardio;
  const lissCount = cardio.filter((c) => c.kind === "liss").length;
  const hiitCount = cardio.filter((c) => c.kind === "hiit").length;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Fitness</h1>
            <button className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg">Export</button>
          </div>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{workouts.length} workouts</div>
        </header>

        <div className="mb-3"><ActivityHeatmap /></div>

        <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]">+ Start a Workout</button>

        <Section title="Templates" meta={`${templates.length}`}>
          <Card>
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 first:border-t-0">
                <button className="min-w-0 flex-1 text-left">
                  <div className="truncate text-base leading-tight text-fg">{t.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">{t.exercises} exercises · used {t.useCount}×</div>
                </button>
                <button className="rounded-[8px] bg-accent px-3 py-1.5 text-xs font-medium text-[#0a160d] active:scale-[0.98]">Run</button>
                <button aria-label="Delete template" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"><XIcon /></button>
              </div>
            ))}
            <button className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2">+ New template</button>
            <button className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2">↻ Reinstall PPLUL program</button>
          </Card>
        </Section>

        <Section title="History" meta={`${workouts.length}`}>
          <Card>
            {workouts.map((w) => (
              <div key={w.id} className="group flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-base leading-tight">{w.name}</div>
                    {w.prs > 0 && <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">{w.prs} PR{w.prs > 1 ? "s" : ""}</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted">
                    {new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {w.exercises} exercises · {Math.floor(w.durationSec/60)}m
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {w.groups.map((g) => <span key={g} className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted">{g}</span>)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-right">
                    <div className="font-mono text-sm text-fg">{w.volume.toLocaleString()}<span className="text-xs text-muted"> lb</span></div>
                    <div className="font-mono text-xs text-muted">{w.reps} reps</div>
                  </div>
                  <button className="rounded-[6px] border border-border bg-bg px-1.5 py-0.5 text-[10px] text-subtle hover:border-border-strong hover:text-fg">Repeat</button>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        <Section title="Cardio" meta={`${cardio.length}`}>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <WeeklyChip label="Zone 2 / LISS" value={lissCount} target={2} hit={lissCount >= 2} />
            <WeeklyChip label="HIIT" value={hiitCount} target={1} hit={hiitCount >= 1} />
          </div>
          <Card>
            {cardio.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium ${c.kind === "hiit" ? "bg-accent-soft text-accent-fg" : "border border-border bg-bg text-muted"}`}>{c.kind === "hiit" ? "HIIT" : "Zone 2"}</span>
                    <span className="truncate text-sm text-fg">{c.modality}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{c.notes ? ` · ${c.notes}` : ""}
                  </div>
                </div>
                <div className="font-mono text-sm text-fg">{c.durationMin}<span className="text-xs text-muted"> min</span></div>
                <button aria-label="Delete" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"><XIcon /></button>
              </div>
            ))}
            <button className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2">+ Log cardio</button>
          </Card>
        </Section>
      </div>
    </div>
  );
}

function WeeklyChip({ label, value, target, hit }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-muted">
        <span>{label}</span>{hit && <span className="text-accent-fg">✓</span>}
      </div>
      <div className="mt-0.5 font-mono text-sm">
        <span className={hit ? "text-accent-fg" : "text-fg"}>{value}</span>
        <span className="text-subtle"> / {target}</span>
        <span className="ml-1 text-[10px] text-subtle">this week</span>
      </div>
    </div>
  );
}

// Faithful port of src/components/ActivityHeatmap.tsx
const AH_WEEKS = 13;
const AH_CELL_BG = [
  "var(--color-surface-2)",
  "color-mix(in oklab, var(--color-accent) 25%, transparent)",
  "color-mix(in oklab, var(--color-accent) 55%, transparent)",
  "var(--color-accent)",
];
const AH_DAY_LABELS = ["M", "", "W", "", "F", "", "S"];
function intensityFor(sets) { if (sets === 0) return 0; if (sets < 6) return 1; if (sets < 16) return 2; return 3; }

function ActivityHeatmap() {
  const setsByDay = uM2(() => {
    const m = new Map();
    for (const w of MOCK.workouts) m.set(w.date, (m.get(w.date) || 0) + w.sets);
    return m;
  }, []);
  const totalCompleted = MOCK.workouts.length;
  const todayMs = T;
  const thisWeekStart = startOfWeekMon();

  const grid = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < AH_WEEKS; col++) {
      const weekOffset = AH_WEEKS - 1 - col;
      const date = thisWeekStart - weekOffset * 7 * DAY + row * DAY;
      grid.push({ date, isFuture: date > todayMs, intensity: intensityFor(setsByDay.get(date) || 0) });
    }
  }

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">Activity</div>
        <div className="font-mono text-[11px] tracking-[0.02em] text-subtle">
          {totalCompleted} {totalCompleted === 1 ? "workout" : "workouts"}
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-col justify-between py-[1px] text-[9px] text-subtle">
          {AH_DAY_LABELS.map((d, i) => <div key={i} className="h-3 leading-[12px]">{d}</div>)}
        </div>
        <div className="flex-1">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${AH_WEEKS}, minmax(0, 1fr))`, gridTemplateRows: "repeat(7, minmax(0, 1fr))", gridAutoFlow: "column" }}>
            {grid.map((cell, i) => (
              <div key={i} title={cell.isFuture ? "" : new Date(cell.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                className="aspect-square rounded-[3px]"
                style={{ background: cell.isFuture ? "transparent" : AH_CELL_BG[cell.intensity], opacity: cell.isFuture ? 0 : 1 }} />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-subtle">
            <span>Less</span>
            {[0,1,2,3].map((lvl) => <div key={lvl} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: AH_CELL_BG[lvl] }} />)}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Macros ───────────────────────────────────────────────────────────
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

function Macros() {
  const [viewMode, setViewMode] = uS2("remaining");
  const toggleView = () => setViewMode((m) => (m === "remaining" ? "eaten" : "remaining"));
  const goals = MOCK.macroGoals;
  const all = MEAL_ORDER.flatMap((m) => MOCK.meals[m]);
  const totals = all.reduce((s, e) => ({
    calories: s.calories + e.macros.calories, carbs: s.carbs + e.macros.carbs,
    protein: s.protein + e.macros.protein, fat: s.fat + e.macros.fat,
  }), { calories: 0, carbs: 0, protein: 0, fat: 0 });
  const fmtRem = (n) => Math.round(Math.abs(n)).toString();

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-4 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Macros</h1>
            <button className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg">Export</button>
          </div>
          <div className="mt-1.5 flex items-center gap-2 font-mono text-xs tracking-[0.02em] text-muted">
            <button onClick={toggleView} className="text-muted hover:text-fg">
              {viewMode === "remaining" ? `${fmtRem(goals.calories - totals.calories)} kcal left` : `${Math.round(totals.calories)} / ${goals.calories} kcal`}
            </button>
            <span>·</span>
            <button className="text-subtle hover:text-fg">edit goals</button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button aria-label="Previous day" className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg">‹</button>
            <div className="font-mono text-sm text-fg">{new Date(T).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</div>
            <button aria-label="Next day" disabled className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle disabled:opacity-30">›</button>
          </div>
        </header>

        <Card>
          <div className="grid grid-cols-3 gap-3 px-3.5 py-3.5">
            <MacroBar label="Carbs" value={totals.carbs} goal={goals.carbs} mode={viewMode} onToggle={toggleView} />
            <MacroBar label="Protein" value={totals.protein} goal={goals.protein} mode={viewMode} onToggle={toggleView} />
            <MacroBar label="Fat" value={totals.fat} goal={goals.fat} mode={viewMode} onToggle={toggleView} />
          </div>
          <button onClick={toggleView} className="block w-full border-t border-border px-3.5 py-2.5 text-left hover:bg-surface-2">
            <div className="font-mono text-xs uppercase tracking-[0.04em] text-muted">calories</div>
            <div className="mt-1 font-mono text-base">
              {viewMode === "remaining"
                ? <React.Fragment>{fmtRem(goals.calories - totals.calories)}<span className="ml-1 text-xs text-subtle">left</span></React.Fragment>
                : <React.Fragment>{Math.round(totals.calories)}<span className="ml-1 text-xs text-subtle">/ {goals.calories}</span></React.Fragment>}
            </div>
            <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (totals.calories / goals.calories) * 100)}%` }} />
            </div>
          </button>
        </Card>

        {MEAL_ORDER.map((meal) => {
          const entries = MOCK.meals[meal];
          const kcal = entries.reduce((s, e) => s + e.macros.calories, 0);
          return (
            <Section key={meal} title={MEAL_LABELS[meal]} meta={`${Math.round(kcal)} kcal`}>
              <Card>
                {entries.length === 0 && <div className="px-3.5 py-3 text-sm text-muted">Nothing logged.</div>}
                {entries.map((e) => (
                  <div key={e.id} className="group flex items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0">
                    <button className="min-w-0 flex-1 text-left">
                      <div className="text-base leading-tight">{e.foodName}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted">
                        {e.servings !== 1 && <span>{e.servings}× · </span>}
                        {Math.round(e.macros.calories)} kcal · C{Math.round(e.macros.carbs)} P{Math.round(e.macros.protein)} F{Math.round(e.macros.fat)}
                      </div>
                    </button>
                    <button aria-label="Remove" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"><XIcon /></button>
                  </div>
                ))}
                <button className="flex w-full items-center justify-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-medium text-accent-fg hover:bg-surface-2"><PlusInCircle /> Add food</button>
              </Card>
            </Section>
          );
        })}

        <Section title="Library" meta={`${MOCK.foodCount}`}>
          <Card><LinkRow title="Browse food library" sub={`${MOCK.foodCount} foods · tap any to edit`} /></Card>
        </Section>
        <Section title="Recipes" meta={`${MOCK.recipeCount}`}>
          <Card><LinkRow title="Browse recipes" sub={`${MOCK.recipeCount} recipes · tap any to edit or log to a meal`} /></Card>
        </Section>
        <Section title="Quick add">
          <Card><LinkRow title="Log macros without saving" sub="For random one-off items you won't have again." /></Card>
        </Section>
      </div>
    </div>
  );
}

function LinkRow({ title, sub }) {
  return (
    <button className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="text-base leading-tight text-fg">{title}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">{sub}</div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

function MacroBar({ label, value, goal, mode, onToggle }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const remaining = goal - value, over = remaining < 0;
  return (
    <button onClick={onToggle} className="min-w-0 text-left">
      <div className="text-xs uppercase tracking-[0.04em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-[15px] tracking-[-0.01em]">
        {mode === "remaining"
          ? <React.Fragment>{Math.round(Math.abs(remaining))}<span className="text-xs text-muted">g</span><span className="ml-1 text-xs text-subtle">{over ? "over" : "left"}</span></React.Fragment>
          : <React.Fragment>{Math.round(value)}<span className="text-xs text-muted">g</span><span className="ml-1 text-xs text-subtle"> / {goal}g</span></React.Fragment>}
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
        <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

// ── Health ───────────────────────────────────────────────────────────
const WEIGHT_SPEC = { type: "weight", label: "Weight", unit: "lb", hint: "Today's weight", format: (v) => v.toFixed(1) };
const SLEEP_SPEC = { type: "sleep", label: "Sleep", unit: "h", hint: "Hours last night", format: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) };
const WATER_SPEC = { type: "water", label: "Water", unit: "L", hint: "Liters today", format: (v) => v.toFixed(2) };
const WEIGHT_WINDOWS = [{ label: "1W", days: 7 }, { label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "1Y", days: 365 }, { label: "All", days: null }];

function Health({ onOpenMetric }) {
  const todayWeight = MOCK.weights[MOCK.weights.length - 1].value;
  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Health</h1>
            <button className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg">Export</button>
          </div>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">weight · sleep · water</div>
        </header>

        <Section title="Today">
          <Card>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <div className="text-base leading-tight text-fg">Weight</div>
                  <span className="font-mono text-xs text-accent-fg">{todayWeight.toFixed(1)}lb</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">Today's weight</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="number" placeholder={todayWeight.toFixed(1)} className="w-20 rounded-[8px] border border-border bg-surface px-2 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle" />
                <button className="rounded-[8px] bg-surface-2 px-2.5 py-1 text-xs font-medium text-subtle">Log</button>
              </div>
            </div>
            <TappableMetricRow spec={SLEEP_SPEC} value={MOCK.metrics.sleep} goal={MOCK.goalsMeta.sleep} streak={MOCK.streaks.sleep} onTap={() => onOpenMetric("sleep")} />
            <TappableMetricRow spec={WATER_SPEC} value={MOCK.metrics.water} goal={MOCK.goalsMeta.water} streak={MOCK.streaks.water} onTap={() => onOpenMetric("water")} />
          </Card>
        </Section>

        <Section title="Weight">
          <div className="space-y-3">
            <WeightHeatmap />
            <TrendCard spec={WEIGHT_SPEC} logs={MOCK.weights} windows={WEIGHT_WINDOWS} defaultWindowIdx={2} />
          </div>
        </Section>
        <Section title="Sleep"><TrendCard spec={SLEEP_SPEC} logs={MOCK.sleepLogs} /></Section>
        <Section title="Water"><TrendCard spec={WATER_SPEC} logs={MOCK.waterLogs} /></Section>
      </div>
    </div>
  );
}

function TappableMetricRow({ spec, value, goal, streak, onTap }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <button onClick={onTap} className="flex w-full items-center gap-3 border-t border-border px-3.5 py-3 text-left hover:bg-surface-2 active:scale-[0.995]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <div className="text-base leading-tight text-fg">{spec.label}</div>
            {streak > 0 && <span className={`font-mono text-[10px] ${streak >= 7 ? "text-accent-fg" : "text-muted"}`}>{streak}d</span>}
          </div>
          <div className="font-mono text-xs">
            <span className="text-fg">{spec.format(value)}{spec.unit}</span>
            <span className="text-subtle"> / {spec.format(goal)}{spec.unit}</span>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-[1px] bg-surface-2">
          <span className="block h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

// Faithful port of src/components/WeightHeatmap.tsx
const WH_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const WH_LOGGED_BG = [
  "color-mix(in oklab, var(--color-accent) 22%, transparent)",
  "color-mix(in oklab, var(--color-accent) 42%, transparent)",
  "color-mix(in oklab, var(--color-accent) 64%, transparent)",
  "var(--color-accent)",
];

function WeightHeatmap() {
  const logs = MOCK.weights;
  const today0 = new Date(T);
  const todayMs = T;
  const [monthAnchor, setMonthAnchor] = uS2(() => new Date(today0.getFullYear(), today0.getMonth(), 1).getTime());
  const [selected, setSelected] = uS2(null);
  React.useEffect(() => { setSelected(null); }, [monthAnchor]);

  const anchorDate = new Date(monthAnchor);
  const year = anchorDate.getFullYear(), month = anchorDate.getMonth();
  const monthName = anchorDate.toLocaleDateString(undefined, { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month, daysInMonth).getTime();

  const weightByDay = uM2(() => {
    const m = new Map();
    for (const l of logs) if (l.date >= monthStart && l.date <= monthEnd) m.set(l.date, l.value);
    return m;
  }, [logs, monthStart, monthEnd]);
  const weightByDayAll = uM2(() => new Map(logs.map((l) => [l.date, l.value])), [logs]);

  const vals = Array.from(weightByDay.values());
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  const levelFor = (w) => {
    if (max === min) return 1;
    const f = (w - min) / (max - min);
    return f < 0.25 ? 0 : f < 0.5 ? 1 : f < 0.75 ? 2 : 3;
  };

  const grid = [];
  const firstWeekday = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d).getTime();
    const weight = weightByDay.get(date);
    grid.push({ day: d, date, weight, level: weight !== undefined ? levelFor(weight) : 0, isFuture: date > todayMs, isToday: date === todayMs });
  }
  while (grid.length % 7 !== 0) grid.push(null);

  let latestLoggedDay = null;
  for (const day of weightByDay.keys()) if (latestLoggedDay === null || day > latestLoggedDay) latestLoggedDay = day;
  const shownDay = selected !== null ? selected : latestLoggedDay;
  const shownWeight = shownDay !== null ? weightByDay.get(shownDay) : undefined;

  const weekInfo = uM2(() => {
    const anchor = shownDay !== null ? shownDay : todayMs;
    const d = new Date(anchor); d.setHours(0, 0, 0, 0);
    const sunday = new Date(d); sunday.setDate(d.getDate() - d.getDay());
    const wvals = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(sunday); day.setDate(sunday.getDate() + i);
      const w = weightByDayAll.get(day.getTime());
      if (w !== undefined) wvals.push(w);
    }
    return { weekStart: sunday.getTime(), weekAvg: wvals.length ? wvals.reduce((s, v) => s + v, 0) / wvals.length : null, count: wvals.length };
  }, [shownDay, todayMs, weightByDayAll]);

  const atCurrentMonth = year === today0.getFullYear() && month === today0.getMonth();

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">Daily weight</div>
        <div className="flex flex-col items-end gap-0.5 font-mono text-[11px] leading-tight tracking-[0.02em]">
          <span className="text-fg">
            {weekInfo.weekAvg !== null
              ? <React.Fragment>{weekInfo.weekAvg.toFixed(1)}<span className="text-subtle"> lb · week avg</span></React.Fragment>
              : <span className="text-subtle">— week avg</span>}
          </span>
          <span className="text-subtle">{avg !== null ? `${avg.toFixed(1)} lb · month avg` : "— month avg"}</span>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => setMonthAnchor(new Date(year, month - 1, 1).getTime())} aria-label="Previous month"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg">‹</button>
        <div className="text-sm font-medium text-fg">{monthName}</div>
        <button onClick={() => { if (!atCurrentMonth) setMonthAnchor(new Date(year, month + 1, 1).getTime()); }} disabled={atCurrentMonth} aria-label="Next month"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30">›</button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-[3px]">
        {WH_WEEKDAY_LABELS.map((d, i) => <div key={i} className="text-center font-mono text-[10px] text-subtle">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (cell === null) return <div key={i} className="aspect-square" />;
          const isShown = shownDay !== null && cell.date === shownDay;
          const isLogged = cell.weight !== undefined;
          const bg = cell.isFuture ? "transparent" : isLogged ? WH_LOGGED_BG[cell.level] : "var(--color-surface-2)";
          const dayTextDark = isLogged && cell.level === 3;
          return (
            <button key={i} disabled={cell.isFuture} onClick={() => setSelected(cell.date)}
              className="relative grid aspect-square place-items-center rounded-[6px]"
              style={{ background: bg, opacity: cell.isFuture ? 0.3 : 1,
                boxShadow: isShown ? "inset 0 0 0 1.5px var(--color-fg)" : cell.isToday ? "inset 0 0 0 1px var(--color-fg)" : "none" }}>
              {isLogged && (
                <span className={`absolute right-[3px] top-[2px] font-mono text-[8px] leading-none opacity-70 ${dayTextDark ? "text-[#0a160d]" : "text-fg"}`}>
                  {Math.round(cell.weight)}
                </span>
              )}
              <span className={`font-mono text-xs ${dayTextDark ? "text-[#0a160d]" : "text-fg"}`}>{cell.day}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-subtle">
        <span>Lighter</span>
        {WH_LOGGED_BG.map((bg, lvl) => <div key={lvl} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: bg }} />)}
        <span>Heavier</span>
      </div>

      <div className="mt-2.5 border-t border-border pt-2.5">
        {shownDay === null ? (
          <div className="text-center font-mono text-[11px] text-subtle">Tap a day to see that day's weight</div>
        ) : (
          <React.Fragment>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-muted">
                {new Date(shownDay).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="font-mono text-sm text-fg">
                {shownWeight !== undefined
                  ? <React.Fragment>{shownWeight.toFixed(1)}<span className="text-xs text-muted"> lb</span></React.Fragment>
                  : <span className="text-subtle">no weigh-in</span>}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-[10px] text-subtle">
              <span>Week of {new Date(weekInfo.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>{weekInfo.weekAvg !== null ? `${weekInfo.weekAvg.toFixed(1)} lb avg · ${weekInfo.count} ${weekInfo.count === 1 ? "entry" : "entries"}` : "no entries this week"}</span>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function TrendCard({ spec, logs, windows, defaultWindowIdx = 0 }) {
  const [windowIdx, setWindowIdx] = uS2(defaultWindowIdx);
  const currentWindow = windows && windows[windowIdx];
  const filtered = uM2(() => {
    if (!currentWindow || currentWindow.days === null) return logs;
    const cutoff = Date.now() - currentWindow.days * DAY;
    return logs.filter((l) => l.date >= cutoff);
  }, [logs, currentWindow]);
  const sorted = [...filtered].sort((a, b) => a.date - b.date);
  const values = sorted.map((l) => l.value);
  const latest = values[values.length - 1], first = values[0];
  const delta = latest !== undefined && first !== undefined ? latest - first : 0;
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;
  const W = 280, H = 44;
  const pt = (l, i) => {
    const x = sorted.length === 1 ? W / 2 : (i / (sorted.length - 1)) * (W - 6) + 3;
    const y = H - 4 - ((l.value - min) / range) * (H - 8);
    return [x, y];
  };
  const path = sorted.map((l, i) => { const [x, y] = pt(l, i); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const deltaIsGood = spec.type === "weight" ? delta < 0 : delta > 0;

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-fg">{spec.label} trend</div>
        {latest !== undefined && (
          <div className="font-mono text-xs">
            <span className="text-fg">{spec.format(latest)}{spec.unit}</span>
            {sorted.length >= 2 && (
              <span className={`ml-2 ${delta === 0 ? "text-muted" : deltaIsGood ? "text-accent-fg" : "text-subtle"}`}>
                {delta > 0 ? "+" : delta < 0 ? "-" : ""}{spec.format(Math.abs(delta))}
              </span>
            )}
          </div>
        )}
      </div>
      {windows && (
        <div className="mt-2 flex gap-1">
          {windows.map((w, i) => (
            <button key={w.label} onClick={() => setWindowIdx(i)} className={`flex-1 rounded-[6px] px-1 py-1 font-mono text-[10px] transition ${i === windowIdx ? "bg-accent-soft text-accent-fg" : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"}`}>
              {w.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        {sorted.length === 0 ? <div className="font-mono text-[11px] text-subtle">no data</div> : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-11 w-full">
            <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {sorted.map((l, i) => { const [x, y] = pt(l, i); return <circle key={i} cx={x} cy={y} r="1.6" fill="var(--color-accent)" />; })}
          </svg>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>{sorted.length} entries</span>
        {sorted.length >= 2 && <span>{spec.format(min)}–{spec.format(max)}{spec.unit}</span>}
      </div>
    </div>
  );
}

// ── Goals ────────────────────────────────────────────────────────────
const TERM_ORDER = ["short", "mid", "long"];
const TERM_LABELS = { short: "Short-term", mid: "Mid-term", long: "Long-term" };

function Goals() {
  const goals = MOCK.goals;
  const active = goals.filter((g) => g.status !== "completed");
  const completed = goals.filter((g) => g.status === "completed");
  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Goals</h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{active.length} active · {completed.length} completed</div>
        </header>
        <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"><PlusIcon14 /> New goal</button>
        {TERM_ORDER.map((term) => {
          const list = active.filter((g) => g.term === term);
          return (
            <Section key={term} title={TERM_LABELS[term]} meta={list.length ? `${list.length}` : ""}>
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
      </div>
    </div>
  );
}

function GoalRow({ goal }) {
  const completed = goal.status === "completed";
  const deadlineStr = goal.targetDate ? new Date(goal.targetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <div className="group flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0 hover:bg-surface-2">
      <button className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${completed ? "border-accent bg-accent" : "border-border-strong"}`}>
        {completed && <CheckIcon />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-base leading-tight ${completed ? "text-subtle line-through" : "text-fg"}`}>{goal.title}</div>
        {(goal.description || deadlineStr) && (
          <div className="mt-0.5 truncate text-xs text-muted">
            {goal.description && <span>{goal.description}</span>}
            {goal.description && deadlineStr && <span> · </span>}
            {deadlineStr && <span className="font-mono">{deadlineStr}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────
function Notes() {
  const notes = MOCK.notes;
  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Notes</h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{notes.length} notes</div>
        </header>
        <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]">+ New note</button>
        <Section title="All notes" meta={`${notes.length}`}>
          <Card>
            {notes.map((n) => {
              const preview = n.body.trim().split("\n").find((l) => l.trim() !== "") || "No additional text";
              return (
                <button key={n.id} className="flex w-full items-start gap-3 border-t border-border px-3.5 py-3 text-left first:border-t-0 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base leading-tight text-fg">{n.title}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{preview}</div>
                  </div>
                  <div className="flex-shrink-0 font-mono text-[11px] text-subtle">{relativeTime(n.updatedAt)}</div>
                </button>
              );
            })}
          </Card>
        </Section>
      </div>
    </div>
  );
}

Object.assign(window, { Fitness, Macros, Health, Goals, Notes });
