// LifeOS — Exercises library + exercise detail (pushed screens off Fitness)
const { useState: uSE, useMemo: uME } = React;

const EX_SEED = [
  { id: 1, name: "Bench Press", equipment: "Barbell", groups: ["chest", "triceps"], base: 185, gain: 22 },
  { id: 2, name: "Incline Dumbbell Press", equipment: "Dumbbell", groups: ["chest"], base: 65, gain: 12.5 },
  { id: 3, name: "Overhead Press", equipment: "Barbell", groups: ["shoulders"], base: 105, gain: 15 },
  { id: 4, name: "Lateral Raise", equipment: "Dumbbell", groups: ["shoulders"], base: 17.5, gain: 5 },
  { id: 5, name: "Tricep Pushdown", equipment: "Cable", groups: ["triceps"], base: 55, gain: 15 },
  { id: 6, name: "Trap Bar Deadlift", equipment: "Barbell", groups: ["back", "glutes"], base: 265, gain: 55 },
  { id: 7, name: "Pull-up", equipment: "Bodyweight", groups: ["back", "biceps"], base: 10, gain: 25 },
  { id: 8, name: "Chest-Supported Row", equipment: "Machine", groups: ["back"], base: 70, gain: 15 },
  { id: 9, name: "Lat Pulldown", equipment: "Cable", groups: ["back", "biceps"], base: 120, gain: 25 },
  { id: 10, name: "Dumbbell Curl", equipment: "Dumbbell", groups: ["biceps"], base: 30, gain: 7.5 },
  { id: 11, name: "Back Squat", equipment: "Barbell", groups: ["quads", "glutes"], base: 205, gain: 45 },
  { id: 12, name: "Romanian Deadlift", equipment: "Barbell", groups: ["hamstrings"], base: 155, gain: 30 },
  { id: 13, name: "Leg Press", equipment: "Machine", groups: ["quads"], base: 270, gain: 70 },
  { id: 14, name: "Bulgarian Split Squat", equipment: "Dumbbell", groups: ["quads", "glutes"], base: 45, gain: 15 },
  { id: 15, name: "Calf Raise", equipment: "Machine", groups: ["calves"], base: 135, gain: 35 },
  { id: 16, name: "Hanging Leg Raise", equipment: "Bodyweight", groups: ["core"], base: 0, gain: 0 },
];

const round5 = (v) => Math.round(v / 2.5) * 2.5;
const e1rm = (w, r) => w * (1 + r / 30);

// Deterministic session history per exercise: 10 sessions, oldest → newest.
const EXERCISES = EX_SEED.map((e, idx) => {
  const n = 10;
  const sessions = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const wobble = ((idx * 7 + i * 13) % 5 - 2) * (e.base > 100 ? 2.5 : 1.25);
    const top = e.base === 0 ? 0 : Math.max(2.5, round5(e.base + e.gain * t + wobble));
    const reps = e.base === 0 ? 12 + ((i + idx) % 4) : [5, 5, 6, 8, 8, 10][(i + idx) % 6];
    const setCount = e.base > 150 ? 3 : 4;
    return {
      date: T - (n - 1 - i) * 7 * DAY - ((idx % 3) * DAY),
      sets: Array.from({ length: setCount }, (_, sIdx) => ({
        w: top === 0 ? 0 : Math.max(2.5, round5(top - sIdx * (top > 100 ? 10 : 5))),
        r: reps + (sIdx === setCount - 1 ? 2 : 0),
      })),
    };
  });
  return { ...e, sessions };
});

function exStats(ex) {
  let best = null, bestE = 0, bestReps = 0, volume = 0;
  for (const s of ex.sessions) for (const st of s.sets) {
    volume += st.w * st.r;
    if (best === null || st.w > best.w || (st.w === best.w && st.r > best.r)) best = { ...st, date: s.date };
    const e = e1rm(st.w, st.r);
    if (e > bestE) bestE = e;
    if (st.r > bestReps) bestReps = st.r;
  }
  const series = ex.sessions.map((s) => ({ date: s.date, value: Math.max(...s.sets.map((st) => e1rm(st.w, st.r))) }));
  const first = series[0].value, last = series[series.length - 1].value;
  return { best, bestE: Math.round(bestE), bestReps, volume, series, delta: Math.round(last - first), last: ex.sessions[ex.sessions.length - 1].date };
}

const EX_FILTERS = [
  ["all", "All"], ["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"],
  ["biceps", "Arms"], ["quads", "Legs"], ["core", "Core"],
];
const ARM_KEYS = ["biceps", "triceps"];
const LEG_KEYS = ["quads", "hamstrings", "glutes", "calves"];

function Sparkline({ series, w = 56, h = 20 }) {
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function ExercisesScreen({ onClose }) {
  const [filter, setFilter] = uSE("all");
  const [openId, setOpenId] = uSE(null);
  const rows = uME(() => EXERCISES.map((e) => ({ ex: e, st: exStats(e) })), []);
  const shown = rows.filter(({ ex }) => {
    if (filter === "all") return true;
    if (filter === "biceps") return ex.groups.some((g) => ARM_KEYS.includes(g));
    if (filter === "quads") return ex.groups.some((g) => LEG_KEYS.includes(g));
    return ex.groups.includes(filter);
  });
  const open = openId !== null ? rows.find((r) => r.ex.id === openId) : null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <button onClick={onClose} className="-ml-1.5 mb-2 flex items-center gap-1 px-1.5 py-1 text-sm text-accent-fg">
            <ChevronLeft /> Fitness
          </button>
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Exercises</h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{EXERCISES.length} tracked · est 1RM from top sets</div>
        </header>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {EX_FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`rounded-full px-2.5 py-1 text-xs ${filter === key ? "bg-surface-2 text-fg" : "border border-border text-subtle hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>

        <Card>
          {shown.map(({ ex, st }) => (
            <button key={ex.id} onClick={() => setOpenId(ex.id)}
              className="flex w-full items-center gap-3 border-t border-border px-3.5 py-2.5 text-left first:border-t-0 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] leading-tight text-fg">{ex.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {ex.equipment} · {new Date(st.last).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </div>
              <Sparkline series={st.series} />
              <div className="whitespace-nowrap text-right">
                <div className="font-mono text-[13px] text-fg">{st.bestE || "—"}<span className="text-[11px] text-muted"> lb</span></div>
                <div className={`font-mono text-[10px] ${st.delta > 0 ? "text-accent-fg" : "text-subtle"}`}>
                  {st.delta > 0 ? `+${st.delta}` : st.delta || "—"}
                </div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          ))}
          {shown.length === 0 && <div className="px-3.5 py-3 text-sm text-muted">Nothing tracked in that group yet.</div>}
        </Card>
      </div>

      {open && <ExerciseDetail ex={open.ex} st={open.st} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function TrendChart({ series }) {
  const W = 320, H = 96, pad = 6;
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${line} ${x(vals.length - 1)},${H} ${x(0)},${H}`;
  return (
    <div className="px-3.5 py-3">
      <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] text-subtle">
        <span>{new Date(series[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>est 1RM · lb</span>
        <span>{new Date(series[series.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
        <polygon points={area} fill="var(--color-accent-soft)" />
        <polyline points={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 3.5 : 2} fill="var(--color-accent)" />)}
      </svg>
      <div className="mt-1 flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-subtle">{Math.round(min)} low</span>
        <span className="text-fg">{Math.round(max)} peak</span>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-[15px] text-fg">
        {value}{unit && <span className="text-[11px] text-muted"> {unit}</span>}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[10px] text-subtle">{sub}</div>}
    </div>
  );
}

function ExerciseDetail({ ex, st, onClose }) {
  const sessions = ex.sessions.slice().reverse();
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <button onClick={onClose} className="-ml-1.5 mb-2 flex items-center gap-1 px-1.5 py-1 text-sm text-accent-fg">
            <ChevronLeft /> Exercises
          </button>
          <h1 className="m-0 text-xl font-medium leading-[1.05] tracking-[-0.025em]">{ex.name}</h1>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-[5px] border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted">{ex.equipment}</span>
            {ex.groups.map((g) => (
              <span key={g} className="rounded-[5px] border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted">{g}</span>
            ))}
          </div>
        </header>

        <Section title="Maxes">
          <Card>
            <div className="grid grid-cols-3 gap-2 px-3.5 py-3">
              <StatTile label="Est 1RM" value={st.bestE} unit="lb" sub={st.delta > 0 ? `+${st.delta} lb all time` : "—"} />
              <StatTile label="Heaviest set" value={st.best.w} unit="lb" sub={`× ${st.best.r} reps`} />
              <StatTile label="Most reps" value={st.bestReps} unit="reps" sub={`${Math.round(st.volume / 1000)}k lb total`} />
            </div>
          </Card>
        </Section>

        <Section title="Weight trend" meta={`${st.series.length} sessions`}>
          <Card><TrendChart series={st.series} /></Card>
        </Section>

        <Section title="History" meta={`${sessions.length}`}>
          <Card>
            {sessions.map((s) => {
              const top = s.sets.reduce((a, b) => (b.w > a.w ? b : a), s.sets[0]);
              const isPR = top.w === st.best.w && s.date === st.best.date;
              return (
                <div key={s.date} className="border-t border-border px-3.5 py-2.5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted">
                      {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {isPR && <span className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">PR</span>}
                      <span className="font-mono text-[11px] text-subtle">
                        {Math.round(e1rm(top.w, top.r))} <span className="text-[10px]">est</span>
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.sets.map((set, i) => (
                      <span key={i} className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
                        {set.w || "BW"}<span className="text-subtle">×{set.r}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      </div>
    </div>
  );
}

Object.assign(window, { ExercisesScreen });
