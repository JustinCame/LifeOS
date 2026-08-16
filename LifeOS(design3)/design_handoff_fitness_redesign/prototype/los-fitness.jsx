// LifeOS — Fitness / Workout section (redesign)
const { useState: uSF, useMemo: uMF } = React;

/* ── program ─────────────────────────────────────────────────────── */
const LIFTS = [
  { key: "push",  dow: 1, name: "Push",  sub: "PPLUL · Day 1", exercises: 7, min: 62 },
  { key: "pull",  dow: 2, name: "Pull",  sub: "PPLUL · Day 2", exercises: 7, min: 58 },
  { key: "legs",  dow: 3, name: "Legs",  sub: "PPLUL · Day 3", exercises: 6, min: 65 },
  { key: "upper", dow: 4, name: "Upper", sub: "PPLUL · Day 4", exercises: 7, min: 60 },
  { key: "lower", dow: 5, name: "Lower", sub: "PPLUL · Day 5", exercises: 6, min: 55 },
];
const CARDIO_OPTS = [
  { key: "liss", name: "Zone 2", sub: "LISS · steady state", min: 40, detail: "Incline walk or rower" },
  { key: "hiit", name: "HIIT",   sub: "Intervals",           min: 20, detail: "Bike sprints" },
];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WORKOUT_KIND = (name) => {
  const n = name.toLowerCase();
  if (n.startsWith("push")) return "push";
  if (n.startsWith("pull")) return "pull";
  if (n.startsWith("leg")) return "legs";
  if (n.startsWith("upper")) return "upper";
  if (n.startsWith("lower")) return "lower";
  return "push";
};

/* ── fatigue model: volume-weighted, decays over 5 days ───────────── */
const MUSCLE_LABELS = {
  chest: "Chest", shoulders: "Shoulders", traps: "Traps", back: "Lats", biceps: "Biceps",
  triceps: "Triceps", forearms: "Forearms", core: "Core", obliques: "Obliques",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves", lowerback: "Lower back",
};
function useFatigue() {
  return uMF(() => {
    const acc = {};
    for (const w of MOCK.workouts) {
      const daysAgo = Math.round((T - w.date) / DAY);
      if (daysAgo < 0 || daysAgo > 5) continue;
      const decay = Math.max(0, 1 - daysAgo / 5.5);
      const per = (w.sets / Math.max(1, w.groups.length)) * decay;
      for (const g of w.groups) acc[g] = (acc[g] || 0) + per;
      if (w.groups.includes("chest") || w.groups.includes("shoulders")) acc.core = (acc.core || 0) + per * 0.25;
      if (w.groups.includes("back")) acc.traps = (acc.traps || 0) + per * 0.55;
      if (w.groups.includes("biceps")) acc.forearms = (acc.forearms || 0) + per * 0.5;
      if (w.groups.includes("quads")) acc.calves = (acc.calves || 0) + per * 0.35;
    }
    const out = {};
    for (const k in acc) out[k] = Math.min(100, Math.round((acc[k] / 12) * 100));
    return out;
  }, []);
}
const fatigueFill = (pct) =>
  !pct ? "color-mix(in oklab, var(--color-fg) 7%, var(--color-surface-2))"
    : `color-mix(in oklab, var(--color-accent) ${Math.round(16 + pct * 0.74)}%, var(--color-surface-2))`;

/* ── screen ──────────────────────────────────────────────────────── */
function Fitness() {
  const todayDow = new Date(T).getDay();
  const todayLift = LIFTS.find((l) => l.dow === todayDow) || null;
  const [mode, setMode] = uSF(() => (todayLift ? "workout" : "cardio"));
  const [liftIdx, setLiftIdx] = uSF(null);
  const [cardioIdx, setCardioIdx] = uSF(0);
  const [exOpen, setExOpen] = uSF(false);
  const [cardioLog, setCardioLog] = uSF([]);
  const [active, setActive] = uSF(false);
  const [sessionOpen, setSessionOpen] = uSF(false);
  const fatigue = useFatigue();
  const weekStart = startOfWeekMon();
  const doneThisWeek = MOCK.workouts.filter((w) => w.date >= weekStart).length;
  const allCardio = cardioLog.concat(MOCK.cardio);
  const cardioThisWeek = allCardio.filter((c) => c.date >= weekStart).length;
  const lift = liftIdx === null ? todayLift : LIFTS[liftIdx];

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="flex items-baseline justify-between gap-2 px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">Fitness</h1>
          <span className="font-mono text-xs tracking-[0.02em] text-muted">{doneThisWeek}/5 this week</span>
        </header>

        <WorkoutCalendar />

        <StartDial mode={mode} onMode={(m) => setMode(m)} active={active}
          onStart={() => {
            if (mode === "cardio") {
              const c = CARDIO_OPTS[cardioIdx];
              setCardioLog((prev) => [{ id: `new-${prev.length}`, kind: c.key, modality: c.detail, date: T, durationMin: c.min }, ...prev]);
            } else { setActive(true); setSessionOpen(true); }
          }}
          lift={lift} swapped={liftIdx !== null} cardio={CARDIO_OPTS[cardioIdx]}
          progress={mode === "cardio" ? Math.min(1, cardioThisWeek / 3) : Math.min(1, doneThisWeek / 5)}
          onSwap={() => {
            if (mode === "cardio") setCardioIdx((i) => (i + 1) % CARDIO_OPTS.length);
            else setLiftIdx((i) => (i === null ? 0 : (i + 1) % LIFTS.length));
          }}
          onReset={() => setLiftIdx(null)} />

        <FatigueCard fatigue={fatigue} />
        <CardioSection extra={cardioLog} />

        <button onClick={() => setExOpen(true)}
          className="mb-[22px] flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-tight text-fg">Exercises</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">maxes · weight trends · per-lift history</div>
          </div>
          <span className="text-subtle">›</span>
        </button>

        <RecentWorkouts />
      </div>
      {exOpen && <ExercisesScreen onClose={() => setExOpen(false)} />}
      {sessionOpen && lift && (
        <WorkoutSession lift={lift} onClose={() => { setSessionOpen(false); setActive(false); }} />
      )}
    </div>
  );
}

/* ── month calendar ──────────────────────────────────────────────── */
const KIND_LETTER = { push: "Ph", pull: "Pl", legs: "Lg", upper: "Up", lower: "Lo", cardio: "C" };
function WorkoutCalendar() {
  const today0 = new Date(T);
  const [anchor, setAnchor] = uSF(() => new Date(today0.getFullYear(), today0.getMonth(), 1).getTime());
  const [selected, setSelected] = uSF(null);
  React.useEffect(() => { setSelected(null); }, [anchor]);

  const a = new Date(anchor), year = a.getFullYear(), month = a.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = uMF(() => {
    const m = new Map();
    for (const w of MOCK.workouts) m.set(w.date, w);
    return m;
  }, []);
  const cardioByDay = uMF(() => {
    const m = new Map();
    for (const c of MOCK.cardio) m.set(c.date, c);
    return m;
  }, []);

  const grid = [];
  for (let i = 0; i < new Date(year, month, 1).getDay(); i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d).getTime();
    grid.push({ day: d, date, workout: byDay.get(date), cardio: cardioByDay.get(date), isFuture: date > T, isToday: date === T });
  }
  while (grid.length % 7 !== 0) grid.push(null);

  const monthCount = MOCK.workouts.filter((w) => { const d = new Date(w.date); return d.getFullYear() === year && d.getMonth() === month; }).length;
  const atCurrent = year === today0.getFullYear() && month === today0.getMonth();
  const sel = selected !== null ? grid.find((c) => c && c.date === selected) : null;

  return (
    <div className="mb-3 rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-fg">{a.toLocaleDateString(undefined, { month: "long" })}</span>
          <span className="font-mono text-[11px] text-subtle">{monthCount} workouts</span>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setAnchor(new Date(year, month - 1, 1).getTime())}
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg"><ChevronLeft /></button>
          <button aria-label="Next month" disabled={atCurrent} onClick={() => setAnchor(new Date(year, month + 1, 1).getTime())}
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"><ChevronRight /></button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-[3px] text-center text-[9px] uppercase tracking-[0.06em] text-subtle">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const lit = !!cell.workout;
          const cardioOnly = !lit && !!cell.cardio;
          const isSel = selected === cell.date;
          return (
            <button key={i} onClick={() => setSelected(isSel ? null : cell.date)}
              className={`relative grid aspect-square place-items-center rounded-[6px] font-mono text-[10px] transition ${
                lit ? "font-medium text-[#0a160d]" : cardioOnly ? "text-accent-fg" : cell.isFuture ? "text-subtle/40" : "text-subtle"}`}
              style={{
                background: lit ? `color-mix(in oklab, var(--color-accent) ${Math.min(100, 45 + cell.workout.sets * 2.6)}%, var(--color-surface-2))`
                  : cardioOnly ? "color-mix(in oklab, var(--color-accent) 14%, var(--color-surface-2))"
                  : cell.isFuture ? "transparent" : "var(--color-surface-2)",
                boxShadow: isSel ? "0 0 0 1.5px var(--color-fg)" : cell.isToday ? "0 0 0 1.5px var(--color-border-strong)" : "none",
              }}>
              {cell.day}
              {lit && <span className="absolute bottom-[1px] right-[2px] whitespace-nowrap text-[7px] leading-none opacity-70">{KIND_LETTER[WORKOUT_KIND(cell.workout.name)]}</span>}
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="mt-2.5 flex items-center gap-3 border-t border-border pt-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-fg">
              {sel.workout ? sel.workout.name : sel.cardio ? `${sel.cardio.modality}` : sel.isFuture ? "Scheduled" : "Rest day"}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">
              {new Date(sel.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {sel.workout && ` · ${sel.workout.sets} sets · ${sel.workout.volume.toLocaleString()} lb · ${Math.round(sel.workout.durationSec / 60)}m`}
              {!sel.workout && sel.cardio && ` · ${sel.cardio.durationMin} min · ${sel.cardio.kind === "hiit" ? "HIIT" : "Zone 2"}`}
            </div>
          </div>
          {sel.workout && sel.workout.prs > 0 && (
            <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">{sel.workout.prs} PR{sel.workout.prs > 1 ? "s" : ""}</span>
          )}
          {sel.workout && <span className="text-subtle">›</span>}
        </div>
      )}
    </div>
  );
}

/* ── start dial ──────────────────────────────────────────────────── */
const fmtLeft = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
const HIIT_INTERVAL = 90;

function StartDial({ mode, onMode, lift, swapped, cardio, progress, onSwap, onReset, onStart, active }) {
  const R = 86, C = 2 * Math.PI * R;
  const isCardio = mode === "cardio";
  const isHiit = isCardio && cardio.key === "hiit";
  const rest = !isCardio && !lift;
  const [run, setRun] = uSF(null);

  React.useEffect(() => { setRun(null); }, [mode, cardio.key]);
  const ticking = run !== null && (isHiit ? run.iv > 0 : !run.paused);
  React.useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      setRun((r) => {
        if (!r) return r;
        if (r.left <= 1) { onStart(); return null; }
        const iv = isHiit ? Math.max(0, r.iv - 1) : r.iv;
        return { ...r, left: r.left - 1, iv };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [ticking, isHiit]);

  const press = () => {
    if (!isCardio) { onStart(); return; }
    const total = cardio.min * 60;
    if (!run) { setRun({ total, left: total, iv: isHiit ? HIIT_INTERVAL : null, paused: false }); return; }
    if (isHiit) {
      const nextIv = run.iv > 0 ? 0 : Math.min(HIIT_INTERVAL, run.left);
      setRun({ ...run, iv: nextIv });
    } else {
      setRun({ ...run, paused: !run.paused });
    }
  };

  const running = isCardio && run !== null;
  const inInterval = running && isHiit && run.iv > 0;
  const title = running ? fmtLeft(run.left) : isCardio ? cardio.name : rest ? "Rest" : lift.name;
  const kicker = running ? (isHiit ? (inInterval ? "Interval" : "Rest — tap for next") : run.paused ? "Paused" : "In progress")
    : isCardio ? "Cardio" : swapped ? DOW_SHORT[lift.dow] : "Today";
  const meta = running
    ? (isHiit ? (inInterval ? `${fmtLeft(run.iv)} in this interval` : `${cardio.min} min total`) : `${cardio.name} · ${cardio.min} min`)
    : isCardio ? `${cardio.min} min`
    : rest ? "Recovery day" : `${lift.exercises} exercises · ~${lift.min}m`;
  const footer = running
    ? (isHiit ? `${HIIT_INTERVAL}s intervals · ${Math.ceil(run.left / HIIT_INTERVAL)} left` : run.paused ? "paused" : "tap the circle to pause")
    : isCardio ? `${cardio.sub} · ${cardio.detail}` : rest ? "no lift scheduled" : lift.sub;
  const action = running
    ? (isHiit ? (inInterval ? "End interval" : "Next 90s") : run.paused ? "Resume" : "Pause")
    : isCardio ? "Start" : rest ? "Log anyway" : active ? "Resume" : "Start";
  const ringPct = running ? (isHiit ? (run.iv || 0) / HIIT_INTERVAL : run.left / run.total) : progress;

  return (
    <div className="mb-4 flex flex-col items-center">
      <div className="mb-3 flex gap-1 rounded-full border border-border bg-surface p-1">
        {[["workout", "Workout"], ["cardio", "Cardio"]].map(([k, label]) => (
          <button key={k} onClick={() => onMode(k)}
            className={`rounded-full px-3 py-1 text-xs ${mode === k ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
        <svg width="204" height="204" viewBox="0 0 204 204" className="block">
          <circle cx="102" cy="102" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
          <circle cx="102" cy="102" r={R} fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${C * ringPct} ${C}`} transform="rotate(-90 102 102)"
            opacity={rest ? 0.4 : running && !ticking ? 0.5 : 1}
            style={{ transition: "stroke-dasharray 0.9s linear" }} />
        </svg>
        <button onClick={press} className={`absolute inset-[22px] flex flex-col items-center justify-center gap-1 rounded-full transition active:scale-[0.97] ${
          rest ? "border border-border bg-surface text-fg" : "bg-accent text-[#0a160d]"}`}>
          <span className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] ${rest ? "text-muted" : "text-[#0a160d]/60"}`}>{kicker}</span>
          <span className="font-medium leading-none tracking-[-0.02em]" style={{ fontSize: running ? 34 : 26 }}>{title}</span>
          <span className={`whitespace-nowrap font-mono text-[11px] ${rest ? "text-subtle" : "text-[#0a160d]/70"}`}>{meta}</span>
          <span className={`mt-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${
            rest ? "border border-border text-subtle" : "bg-[#0a160d]/12 text-[#0a160d]"}`}>{action}</span>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-subtle">
        <span>{footer}</span>
        <span>·</span>
        <button onClick={running ? () => setRun(null) : swapped && !isCardio ? onReset : onSwap} className="text-accent-fg hover:underline">
          {running ? "cancel" : isCardio ? "switch type" : swapped ? "back to today" : "swap day"}
        </button>
      </div>
    </div>
  );
}

/* ── fatigue ─────────────────────────────────────────────────────── */
const BM_VIEWBOX = { front: "0 0 35 93", back: "37 0 35 93" };
function bmGroup(id) {
  if (/^chest/.test(id)) return "chest";
  if (/^shoulder|^deltoid/.test(id)) return "shoulders";
  if (/^traps/.test(id)) return "traps";
  if (/^lats/.test(id)) return "back";
  if (/^biceps/.test(id)) return "biceps";
  if (/^triceps/.test(id)) return "triceps";
  if (/^forearm/.test(id)) return "forearms";
  if (/^abs|^serratus/.test(id)) return "core";
  if (/^obliques/.test(id)) return "obliques";
  if (/^quads|^hip-flexor|^adductors/.test(id)) return "quads";
  if (/^hamstrings/.test(id)) return "hamstrings";
  if (/^gluteus/.test(id)) return "glutes";
  if (/^calves|^tibialis/.test(id)) return "calves";
  if (/^lower-back/.test(id)) return "lowerback";
  return null;
}

function BodyFigure({ view, fatigue, picked, onPick, label }) {
  const list = (view === "front" ? window.BM_FRONT : window.BM_BACK) || [];
  return (
    <div className="min-w-0 flex-1">
      <svg viewBox={BM_VIEWBOX[view]} className="block w-full" style={{ height: 232 }}>
        <g strokeLinejoin="round">
          {list.map((m) => {
            const g = bmGroup(m.id);
            const on = g !== null && picked === g;
            return (
              <path key={m.id} d={m.path}
                fill={g ? fatigueFill(fatigue[g] || 0) : "color-mix(in oklab, var(--color-surface-2) 70%, transparent)"}
                stroke={on ? "var(--color-fg)" : "var(--color-border-strong)"}
                strokeWidth={on ? 0.32 : 0.12}
                onClick={g ? () => onPick(g) : undefined}
                style={{ cursor: g ? "pointer" : "default" }} />
            );
          })}
        </g>
      </svg>
      <div className="mt-1 text-center text-[9px] uppercase tracking-[0.08em] text-subtle">{label}</div>
    </div>
  );
}

function FatigueCard({ fatigue }) {
  const [picked, setPicked] = uSF(null);
  const ranked = uMF(() => Object.entries(fatigue).filter(([, v]) => v >= 8).sort((x, y) => y[1] - x[1]), [fatigue]);
  const overall = ranked.length ? Math.round(ranked.slice(0, 4).reduce((s, [, v]) => s + v, 0) / Math.min(4, ranked.length)) : 0;
  const pick = (g) => setPicked((p) => (p === g ? null : g));
  const pickedPct = picked ? fatigue[picked] || 0 : null;

  return (
    <Section title="Fatigue" meta={overall > 0 ? `${overall}% avg` : "fresh"}>
      <Card>
        <div className="flex gap-2 px-3 py-3">
          <BodyFigure view="front" fatigue={fatigue} picked={picked} onPick={pick} label="Front" />
          <BodyFigure view="back" fatigue={fatigue} picked={picked} onPick={pick} label="Back" />
          <div className="w-[104px] flex-shrink-0 pt-0.5">
            {ranked.length === 0 ? (
              <div className="text-[12px] text-muted">Fully recovered.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {ranked.slice(0, 8).map(([g, v]) => (
                  <button key={g} onClick={() => pick(g)}
                    className="flex items-baseline justify-between gap-1.5 rounded-[6px] px-1 py-px text-left hover:bg-surface-2"
                    style={picked === g ? { backgroundColor: "var(--color-surface-2)" } : undefined}>
                    <span className={`truncate text-[12px] ${picked === g ? "text-fg" : "text-muted"}`}>{MUSCLE_LABELS[g]}</span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-fg">{v}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {picked && (
          <div className="flex items-baseline justify-between gap-2 border-t border-border px-3.5 py-2">
            <span className="text-sm text-fg">{MUSCLE_LABELS[picked]}</span>
            <span className="font-mono text-[11px] text-muted">
              {pickedPct >= 8 ? `${pickedPct}% · recovers in ~${Math.max(1, Math.ceil(pickedPct / 25))}d` : "recovered · train freely"}
            </span>
          </div>
        )}
      </Card>
    </Section>
  );
}

/* ── recent + cardio ─────────────────────────────────────────────── */
function RecentWorkouts() {
  const [open, setOpen] = uSF(true);
  const [all, setAll] = uSF(false);
  const list = all ? MOCK.workouts : MOCK.workouts.slice(0, 5);
  return (
    <section className="mb-[22px]">
      <button onClick={() => setOpen((v) => !v)} className="mx-1.5 mb-2.5 flex w-full items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Recent</span>
          <span className={`text-subtle ${open ? "" : "-rotate-90"}`} style={{ display: "inline-block", fontSize: 9 }}>▾</span>
        </span>
        <span className="font-mono text-xs tracking-[0.02em] text-subtle">{MOCK.workouts.length}</span>
      </button>
      {open && (
        <Card>
          {list.map((w) => (
            <button key={w.id} className="flex w-full items-center gap-3 border-t border-border px-3.5 py-2.5 text-left first:border-t-0 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] leading-tight text-fg">{w.name}</span>
                  {w.prs > 0 && <span className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">{w.prs} PR{w.prs > 1 ? "s" : ""}</span>}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {w.sets} sets · {Math.round(w.durationSec / 60)}m
                </div>
              </div>
              <div className="whitespace-nowrap text-right font-mono text-[13px] text-fg">{w.volume.toLocaleString()}<span className="text-[11px] text-muted"> lb</span></div>
              <span className="text-subtle">›</span>
            </button>
          ))}
          <button onClick={() => setAll((v) => !v)} className="w-full border-t border-border py-2 text-center text-xs text-subtle hover:bg-surface-2 hover:text-fg">
            {all ? "Show less" : `Show all (${MOCK.workouts.length})`}
          </button>
        </Card>
      )}
    </section>
  );
}

function CardioSection({ extra = [] }) {
  const [open, setOpen] = uSF(true);
  const [calOpen, setCalOpen] = uSF(true);
  const weekStart = startOfWeekMon();
  const all = extra.concat(MOCK.cardio);
  const week = all.filter((c) => c.date >= weekStart);
  const liss = week.filter((c) => c.kind === "liss").length, hiit = week.filter((c) => c.kind === "hiit").length;
  return (
    <section className="mb-[22px]">
      <button onClick={() => setOpen((v) => !v)} className="mx-1.5 mb-2.5 flex w-full items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Cardio</span>
          <span className={`text-subtle ${open ? "" : "-rotate-90"}`} style={{ display: "inline-block", fontSize: 9 }}>▾</span>
        </span>
        <span className="font-mono text-xs tracking-[0.02em] text-subtle">{liss}/2 Z2 · {hiit}/1 HIIT</span>
      </button>
      {open && (
        <Card>
          {all.slice(0, 5).map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
              <span className={`whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium ${c.kind === "hiit" ? "bg-accent-soft text-accent-fg" : "border border-border bg-bg text-muted"}`}>
                {c.kind === "hiit" ? "HIIT" : "Zone 2"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-fg">{c.modality}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">{new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </div>
              <div className="whitespace-nowrap font-mono text-[13px] text-fg">{c.durationMin}<span className="text-[11px] text-muted"> min</span></div>
            </div>
          ))}
        </Card>
      )}
      <button onClick={() => setCalOpen((v) => !v)} className="mx-1.5 mb-2.5 mt-3 flex w-full items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Cardio days</span>
          <span className={`text-subtle ${calOpen ? "" : "-rotate-90"}`} style={{ display: "inline-block", fontSize: 9 }}>▾</span>
        </span>
        <span className="font-mono text-xs tracking-[0.02em] text-subtle">{all.length} logged</span>
      </button>
      {calOpen && <CardioCalendar sessions={all} />}
    </section>
  );
}

/* ── cardio month calendar ───────────────────────────────────────── */
function CardioCalendar({ sessions }) {
  const today0 = new Date(T);
  const [anchor, setAnchor] = uSF(() => new Date(today0.getFullYear(), today0.getMonth(), 1).getTime());
  const [selected, setSelected] = uSF(null);
  React.useEffect(() => { setSelected(null); }, [anchor]);

  const a = new Date(anchor), year = a.getFullYear(), month = a.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = uMF(() => {
    const m = new Map();
    for (const c of sessions) m.set(c.date, c);
    return m;
  }, [sessions]);

  const grid = [];
  for (let i = 0; i < new Date(year, month, 1).getDay(); i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d).getTime();
    grid.push({ day: d, date, session: byDay.get(date), isFuture: date > T, isToday: date === T });
  }
  while (grid.length % 7 !== 0) grid.push(null);

  const monthMin = sessions.reduce((t, c) => {
    const d = new Date(c.date);
    return d.getFullYear() === year && d.getMonth() === month ? t + c.durationMin : t;
  }, 0);
  const atCurrent = year === today0.getFullYear() && month === today0.getMonth();
  const sel = selected !== null ? grid.find((c) => c && c.date === selected) : null;

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-fg">{a.toLocaleDateString(undefined, { month: "long" })}</span>
          <span className="font-mono text-[11px] text-subtle">{monthMin} min</span>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setAnchor(new Date(year, month - 1, 1).getTime())}
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg"><ChevronLeft /></button>
          <button aria-label="Next month" disabled={atCurrent} onClick={() => setAnchor(new Date(year, month + 1, 1).getTime())}
            className="grid h-6 w-6 place-items-center rounded-[7px] text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"><ChevronRight /></button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-[3px] text-center text-[9px] uppercase tracking-[0.06em] text-subtle">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const lit = !!cell.session;
          const isSel = selected === cell.date;
          return (
            <button key={i} onClick={() => setSelected(isSel ? null : cell.date)}
              className={`relative grid aspect-square place-items-center rounded-[6px] font-mono text-[10px] transition ${
                lit ? "font-medium text-[#0a160d]" : cell.isFuture ? "text-subtle/40" : "text-subtle"}`}
              style={{
                background: lit
                  ? `color-mix(in oklab, var(--color-accent) ${cell.session.kind === "hiit" ? 92 : 58}%, var(--color-surface-2))`
                  : cell.isFuture ? "transparent" : "var(--color-surface-2)",
                boxShadow: isSel ? "0 0 0 1.5px var(--color-fg)" : cell.isToday ? "0 0 0 1.5px var(--color-border-strong)" : "none",
              }}>
              {cell.day}
              {lit && <span className="absolute bottom-[1px] right-[2px] whitespace-nowrap text-[7px] leading-none opacity-70">{cell.session.kind === "hiit" ? "H" : "Z2"}</span>}
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <div className="truncate text-sm text-fg">
            {sel.session ? sel.session.modality : sel.isFuture ? "Nothing scheduled" : "No cardio"}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {new Date(sel.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {sel.session && ` · ${sel.session.durationMin} min · ${sel.session.kind === "hiit" ? "HIIT" : "Zone 2"}`}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Fitness });
