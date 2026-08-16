// LifeOS — live workout session screen (full-screen, opened from the start dial)
const { useState: uSW, useEffect: uEW, useRef: uRW } = React;

const SESSION_PLANS = {
  push: [
    { name: "Bench Press", equip: "Barbell", sets: 4, reps: "5-7", rest: 180, w: 205, r: 6, alts: ["Incline Barbell Press", "Machine Chest Press", "Dumbbell Bench Press"] },
    { name: "Incline Dumbbell Press", equip: "Dumbbell", sets: 3, reps: "8-10", rest: 120, w: 75, r: 9, alts: ["Incline Machine Press", "Low-Incline DB Press", "Smith Incline Press"] },
    { name: "Dumbbell Shoulder Press", equip: "Dumbbell", sets: 3, reps: "8-10", rest: 120, w: 60, r: 9, alts: ["Barbell Overhead Press", "Machine Shoulder Press", "Arnold Press"] },
    { name: "Dumbbell Fly", equip: "Dumbbell", sets: 3, reps: "12-15", rest: 90, w: 30, r: 13, alts: ["Cable Fly", "Pec Deck", "Low-to-High Cable Fly"] },
    { name: "Lateral Raise", equip: "Dumbbell", sets: 4, reps: "12-15", rest: 60, w: 20, r: 14, alts: ["Cable Lateral Raise", "Machine Lateral Raise", "Lean-Away DB Raise"] },
    { name: "Tricep Pushdown", equip: "Cable", sets: 3, reps: "10-12", rest: 90, w: 70, r: 11, alts: ["Rope Pushdown", "Dip Machine", "Close-Grip Bench"] },
    { name: "Overhead Tricep Extension", equip: "Dumbbell", sets: 3, reps: "10-12", rest: 90, w: 45, r: 11, alts: ["Cable Overhead Extension", "Skullcrusher", "JM Press"] },
  ],
  pull: [
    { name: "Trap Bar Deadlift", equip: "Barbell", sets: 3, reps: "5", rest: 180, w: 315, r: 5, alts: ["Conventional Deadlift", "Rack Pull", "Hex Bar Jump-Free Pull"] },
    { name: "Pull-up", equip: "Bodyweight", sets: 4, reps: "5-8", rest: 150, w: 25, r: 7, alts: ["Weighted Chin-up", "Assisted Pull-up", "Neutral-Grip Pull-up"] },
    { name: "Chest-Supported Row", equip: "Machine", sets: 3, reps: "8-10", rest: 120, w: 85, r: 9, alts: ["Seal Row", "T-Bar Row", "Dumbbell Row"] },
    { name: "Lat Pulldown", equip: "Cable", sets: 3, reps: "10-12", rest: 90, w: 145, r: 11, alts: ["Neutral-Grip Pulldown", "Straight-Arm Pulldown", "Machine Pullover"] },
    { name: "Reverse Pec Deck", equip: "Machine", sets: 3, reps: "15", rest: 60, w: 60, r: 15, alts: ["Rear Delt DB Fly", "Face Pull", "Cable Reverse Fly"] },
    { name: "Dumbbell Curl", equip: "Dumbbell", sets: 3, reps: "8-10", rest: 90, w: 40, r: 9, alts: ["Barbell Curl", "Cable Curl", "Preacher Curl"] },
    { name: "Hammer Curl", equip: "Dumbbell", sets: 3, reps: "10-12", rest: 90, w: 35, r: 11, alts: ["Rope Hammer Curl", "Cross-Body Curl", "Reverse Curl"] },
  ],
  legs: [
    { name: "Back Squat", equip: "Barbell", sets: 4, reps: "5-7", rest: 180, w: 245, r: 6, alts: ["Hack Squat", "Front Squat", "Safety-Bar Squat"] },
    { name: "Romanian Deadlift", equip: "Barbell", sets: 3, reps: "8-10", rest: 150, w: 185, r: 9, alts: ["Dumbbell RDL", "Good Morning", "Seated Leg Curl"] },
    { name: "Leg Press", equip: "Machine", sets: 3, reps: "10-12", rest: 120, w: 340, r: 11, alts: ["Hack Squat", "Belt Squat", "Smith Squat"] },
    { name: "Walking Lunge", equip: "Dumbbell", sets: 3, reps: "10", rest: 90, w: 50, r: 10, alts: ["Reverse Lunge", "Split Squat", "Step-up"] },
    { name: "Leg Curl", equip: "Machine", sets: 3, reps: "10-12", rest: 90, w: 110, r: 11, alts: ["Seated Leg Curl", "Nordic Curl", "Glute-Ham Raise"] },
    { name: "Calf Raise", equip: "Machine", sets: 4, reps: "10-12", rest: 60, w: 170, r: 11, alts: ["Seated Calf Raise", "Leg Press Calf Raise", "Single-Leg Calf Raise"] },
  ],
  upper: [
    { name: "Overhead Press", equip: "Barbell", sets: 4, reps: "6-8", rest: 150, w: 130, r: 7, alts: ["Seated DB Press", "Machine Press", "Push Press"] },
    { name: "Dips", equip: "Bodyweight", sets: 3, reps: "8-10", rest: 120, w: 35, r: 9, alts: ["Close-Grip Bench", "Assisted Dip", "Machine Dip"] },
    { name: "Dumbbell Row", equip: "Dumbbell", sets: 4, reps: "8-10", rest: 120, w: 95, r: 9, alts: ["Chest-Supported Row", "Cable Row", "Meadows Row"] },
    { name: "Incline Dumbbell Curl", equip: "Dumbbell", sets: 3, reps: "10-12", rest: 90, w: 30, r: 11, alts: ["Cable Curl", "Spider Curl", "Preacher Curl"] },
    { name: "Cable Lateral Raise", equip: "Cable", sets: 4, reps: "12-15", rest: 60, w: 15, r: 14, alts: ["DB Lateral Raise", "Machine Raise", "Cable Y-Raise"] },
    { name: "Hanging Leg Raise", equip: "Bodyweight", sets: 3, reps: "10-15", rest: 60, w: 0, r: 12, alts: ["Captain's Chair Raise", "Cable Crunch", "Ab Wheel"] },
  ],
  lower: [
    { name: "Bulgarian Split Squat", equip: "Dumbbell", sets: 4, reps: "8", rest: 150, w: 60, r: 8, alts: ["Front Squat", "Reverse Lunge", "Leg Press"] },
    { name: "Hip Thrust", equip: "Barbell", sets: 3, reps: "8-10", rest: 120, w: 225, r: 9, alts: ["Machine Hip Thrust", "Glute Bridge", "Cable Pull-Through"] },
    { name: "Stiff-Leg Deadlift", equip: "Barbell", sets: 3, reps: "8-10", rest: 120, w: 175, r: 9, alts: ["Dumbbell RDL", "Back Extension", "Good Morning"] },
    { name: "Leg Extension", equip: "Machine", sets: 3, reps: "12-15", rest: 90, w: 120, r: 13, alts: ["Sissy Squat", "Cyclist Squat", "Leg Press (high rep)"] },
    { name: "Seated Leg Curl", equip: "Machine", sets: 3, reps: "12-15", rest: 90, w: 100, r: 13, alts: ["Lying Leg Curl", "Nordic Curl", "Cable Leg Curl"] },
    { name: "Standing Calf Raise", equip: "Machine", sets: 4, reps: "10-12", rest: 60, w: 180, r: 11, alts: ["Seated Calf Raise", "Smith Calf Raise", "Donkey Calf Raise"] },
  ],
};

const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function WorkoutSession({ lift, onClose }) {
  const plan = SESSION_PLANS[lift.key] || SESSION_PLANS.push;
  const [exercises, setExercises] = uSW(() => plan.map((p) => ({
    ...p, swappedFrom: null,
    log: Array.from({ length: p.sets }, () => ({ done: false, w: p.w, r: p.r, rpe: "" })),
  })));
  const [swapFor, setSwapFor] = uSW(null);
  const [rest, setRest] = uSW(null);
  const [elapsed, setElapsed] = uSW(0);

  uEW(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSets = exercises.reduce((s, e) => s + e.log.length, 0);
  const doneSets = exercises.reduce((s, e) => s + e.log.filter((l) => l.done).length, 0);
  const volume = exercises.reduce((s, e) => s + e.log.reduce((t, l) => t + (l.done ? l.w * l.r : 0), 0), 0);
  const rpes = exercises.flatMap((e) => e.log.filter((l) => l.done && l.rpe !== "").map((l) => Number(l.rpe)));
  const avgRpe = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;

  const setField = (ei, si, key, value) => setExercises((prev) => prev.map((e, i) => i !== ei ? e
    : { ...e, log: e.log.map((l, j) => (j === si ? { ...l, [key]: value } : l)) }));

  const toggleSet = (ei, si) => {
    const ex = exercises[ei], entry = ex.log[si];
    setField(ei, si, "done", !entry.done);
    if (!entry.done) setRest({ total: ex.rest, left: ex.rest, label: ex.name, next: si + 1 < ex.log.length ? `Set ${si + 2} of ${ex.log.length}` : "Next exercise" });
  };

  const swap = (name) => {
    setExercises((prev) => prev.map((e, i) => i !== swapFor ? e : { ...e, swappedFrom: e.swappedFrom || e.name, name, alts: [e.name, ...e.alts.filter((a) => a !== name)] }));
    setSwapFor(null);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <div className="flex items-center gap-3 border-t border-border px-[18px] pb-2.5 pt-[52px]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-medium leading-tight text-fg">{lift.name} day</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {fmtClock(elapsed)} · {doneSets}/{totalSets} sets · {Math.round(volume).toLocaleString()} lb{avgRpe && ` · RPE ${avgRpe}`}
          </div>
        </div>
        <button onClick={onClose} className="rounded-[8px] bg-accent px-3 py-1.5 text-xs font-medium text-[#0a160d] active:scale-[0.98]">Finish</button>
        <button onClick={onClose} aria-label="Close workout" className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"><XIcon /></button>
      </div>
      <div className="h-0.5 bg-surface-2">
        <span className="block h-full bg-accent transition-[width]" style={{ width: `${(doneSets / totalSets) * 100}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pb-[40px] pt-3 [&::-webkit-scrollbar]:hidden">
        {exercises.map((ex, ei) => {
          const done = ex.log.every((l) => l.done);
          return (
            <div key={ex.name + ei} className="mb-2.5 overflow-hidden rounded-[16px] border border-border bg-surface">
              <div className="flex items-start gap-2 px-3.5 pt-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[15px] leading-tight ${done ? "text-subtle" : "text-fg"}`}>{ex.name}</span>
                    {done && <span className="text-accent-fg"><CheckSmall /></span>}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {ex.equip} · {ex.log.length}×{ex.reps} · {ex.rest}s rest
                    {ex.swappedFrom && <span className="text-subtle"> · swapped from {ex.swappedFrom}</span>}
                  </div>
                </div>
                <button onClick={() => setSwapFor(ei)}
                  className="whitespace-nowrap rounded-[8px] border border-border bg-bg px-2 py-1 text-[11px] text-subtle hover:border-border-strong hover:text-fg">
                  ⇄ Swap
                </button>
              </div>
              <div className="mt-2">
                <div className="flex items-center gap-2 border-t border-border px-3.5 pt-1.5 text-[9px] uppercase tracking-[0.06em] text-subtle">
                  <span className="w-5">set</span>
                  <span className="w-20 text-center">lb</span>
                  <span className="w-3" />
                  <span className="w-[56px] text-center">reps</span>
                  <span className="w-[52px] text-center">rpe</span>
                  <span className="ml-auto w-7" />
                </div>
                {ex.log.map((l, si) => (
                  <div key={si} className="flex items-center gap-2 px-3.5 py-1.5">
                    <span className="w-5 font-mono text-[11px] text-subtle">{si + 1}</span>
                    <input type="number" value={l.w} onChange={(e) => setField(ei, si, "w", Number(e.target.value))}
                      className="w-20 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm outline-none" />
                    <span className="w-3 text-center font-mono text-[11px] text-subtle">×</span>
                    <input type="number" value={l.r} onChange={(e) => setField(ei, si, "r", Number(e.target.value))}
                      className="w-[56px] rounded-[8px] border border-border bg-bg px-1 py-1 text-center font-mono text-sm outline-none" />
                    <input type="number" min="5" max="10" step="0.5" value={l.rpe} placeholder="—"
                      onChange={(e) => setField(ei, si, "rpe", e.target.value)}
                      className="w-[52px] rounded-[8px] border border-border bg-bg px-1 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle" />
                    <button onClick={() => toggleSet(ei, si)} aria-label={l.done ? "Unlog set" : "Log set"}
                      className={`ml-auto grid h-7 w-7 place-items-center rounded-[8px] border-[1.5px] transition ${
                        l.done ? "border-accent bg-accent" : "border-border-strong hover:border-accent"}`}>
                      {l.done && <CheckIcon />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {swapFor !== null && (
        <SwapSheet ex={exercises[swapFor]} onPick={swap} onClose={() => setSwapFor(null)} />
      )}
      {rest && <RestTimer rest={rest} onChange={setRest} onDone={() => setRest(null)} />}
    </div>
  );
}

const CheckSmall = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6.4 L4.6 9 L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;

function SwapSheet({ ex, onPick, onClose }) {
  return (
    <React.Fragment>
      <div onClick={onClose} className="absolute inset-0 z-40 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] border-t border-border bg-bg pb-[22px] shadow-[0_-20px_40px_rgb(0_0_0/0.32)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-baseline justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">Replace exercise</span>
          <button onClick={onClose} className="px-1.5 py-1 text-base text-accent-fg">Cancel</button>
        </div>
        <div className="px-[18px]">
          <div className="mb-2 font-mono text-[11px] text-subtle">Currently {ex.name} · {ex.log.length}×{ex.reps}</div>
          <Card>
            {ex.alts.map((alt) => (
              <button key={alt} onClick={() => onPick(alt)}
                className="flex w-full items-center gap-3 border-t border-border px-3.5 py-3 text-left first:border-t-0 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] leading-tight text-fg">{alt}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">same sets · same rep target</div>
                </div>
                <span className="text-subtle">›</span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    </React.Fragment>
  );
}

function RestTimer({ rest, onChange, onDone }) {
  const R = 108, C = 2 * Math.PI * R;
  const leftRef = uRW(rest.left);
  leftRef.current = rest.left;
  uEW(() => {
    const id = setInterval(() => {
      if (leftRef.current <= 1) { clearInterval(id); onDone(); return; }
      onChange((r) => (r ? { ...r, left: r.left - 1 } : r));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const pct = rest.left / rest.total;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg/95 backdrop-blur-xl">
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">Rest</div>
        <div className="mt-1 text-lg text-fg">{rest.label}</div>
      </div>
      <div className="relative">
        <svg width="248" height="248" viewBox="0 0 248 248" className="block">
          <circle cx="124" cy="124" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
          <circle cx="124" cy="124" r={R} fill="none" stroke="var(--color-accent)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 124 124)" style={{ transition: "stroke-dasharray 0.9s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-medium text-fg" style={{ fontSize: 46, letterSpacing: "-0.02em" }}>{fmtClock(rest.left)}</span>
          <span className="mt-1 font-mono text-[11px] text-subtle">{rest.next}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange((r) => (r ? { ...r, left: Math.max(5, r.left - 30) } : r))}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg hover:border-border-strong">−30s</button>
        <button onClick={() => onChange((r) => (r ? { ...r, left: r.left + 30, total: Math.max(r.total, r.left + 30) } : r))}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg hover:border-border-strong">+30s</button>
        <button onClick={onDone} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-[#0a160d] active:scale-[0.98]">Skip rest</button>
      </div>
    </div>
  );
}

Object.assign(window, { WorkoutSession });
