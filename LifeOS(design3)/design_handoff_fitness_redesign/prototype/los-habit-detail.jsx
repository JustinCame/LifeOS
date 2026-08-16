// LifeOS — habit detail screen (pushed over the Habits tab)
const { useState: uSD, useEffect: uED } = React;

function HabitDetail({ habit, onClose, onChange, onScheduleChange }) {
  const [shown, setShown] = uSD(false);
  uED(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  const close = () => { setShown(false); window.setTimeout(onClose, 260); };

  const kindLabel = { binary: "Yes / no", count: "Count", duration: "Duration", avoid: "Avoidance" }[habit.kind];
  const scheduledDays = habit.history.filter((d) => d.r !== null).length;
  const hitDays = habit.history.filter((d) => d.r !== null && d.r >= 1).length;
  const partialDays = habit.history.filter((d) => d.r !== null && d.r > 0 && d.r < 1).length;

  return (
    <div className={`absolute inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 ${shown ? "translate-x-0" : "translate-x-full"}`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}>
      <div className="flex-1 overflow-y-auto px-[18px] pb-[40px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-between px-1.5 pb-3 pt-3.5">
          <button onClick={close} className="-ml-1.5 flex items-center gap-1 px-1.5 py-1 text-base text-accent-fg">
            <ChevronLeft /> Habits
          </button>
          <button className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-subtle hover:border-border-strong hover:text-fg">Edit</button>
        </div>

        <header className="px-1.5 pb-4">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">{habit.name}</h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {kindLabel} · {targetLabel(habit)} · {scheduleLabel(habit)}
          </div>
        </header>

        {/* Big draggable ring */}
        <div className="mb-3 flex flex-col items-center rounded-[16px] border border-border bg-surface px-3.5 py-6">
          <DragRing habit={habit} size={168} stroke={12} onChange={onChange} />
          <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-subtle">
            {habit.kind === "binary" || habit.kind === "avoid" ? "tap to toggle" : "drag around the ring to log"}
          </div>
          {(habit.kind === "count" || habit.kind === "duration") && (
            <div className="mt-3 flex gap-2">
              {[-1, +1, +5].map((d) => (
                <button key={d} onClick={() => onChange(Math.max(0, Math.min(habit.target, habit.today + d)))}
                  className="rounded-[10px] border border-border bg-bg px-3.5 py-1.5 font-mono text-sm text-fg hover:border-border-strong">
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <button onClick={() => onChange(habit.target)}
                className="rounded-[10px] bg-accent px-3.5 py-1.5 font-mono text-sm font-medium text-[#0a160d]">done</button>
            </div>
          )}
        </div>

        <Section title="Streak">
          <div className="grid grid-cols-4 overflow-hidden rounded-[16px] border border-border bg-surface">
            <StatCell label="current" value={`${habit.streak}d`} accent={habit.streak >= 7} />
            <StatCell label="best" value={`${habit.best}d`} />
            <StatCell label="30-day" value={`${habit.consistency}%`} accent={habit.consistency >= 80} />
            <StatCell label="hit" value={`${hitDays}/${scheduledDays}`} />
          </div>
        </Section>

        <Section title="Last 12 weeks" meta={`${partialDays} partial`}>
          <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3.5">
            <HabitHeatmap history={buildLongHistory(habit)} cols={12} cell={11} />
            <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-subtle">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-surface-2" /> missed</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: "color-mix(in oklab, var(--color-accent) 55%, transparent)" }} /> partial</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-accent" /> hit</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] border border-border" /> rest</span>
            </div>
          </div>
        </Section>

        <Section title="Schedule">
          <Card>
            <div className="px-3.5 py-3">
              <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">repeats</div>
              <div className="flex gap-1.5">
                {[["daily", "Every day"], ["weekdays", "Weekdays"], ["perWeek", "N per week"]].map(([mode, label]) => (
                  <button key={mode} onClick={() => onScheduleChange(mode)}
                    className={`flex-1 rounded-[8px] px-2 py-1.5 text-xs font-medium transition ${habit.schedule.mode === mode ? "bg-accent-soft text-accent-fg" : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {habit.schedule.mode === "weekdays" && (
                <div className="mt-3 flex gap-1.5">
                  {WEEKDAY_LABELS.map((d, i) => {
                    const on = habit.schedule.days.includes(i);
                    return (
                      <button key={i} className={`grid h-8 flex-1 place-items-center rounded-[8px] text-xs font-medium transition ${on ? "bg-accent text-[#0a160d]" : "border border-border bg-bg text-subtle"}`}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              {habit.schedule.mode === "perWeek" && (
                <div className="mt-3 flex items-center gap-2">
                  {[1,2,3,4,5,6,7].map((n) => (
                    <button key={n} className={`grid h-8 flex-1 place-items-center rounded-[8px] font-mono text-xs transition ${habit.schedule.perWeek === n ? "bg-accent text-[#0a160d]" : "border border-border bg-bg text-subtle"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(habit.kind === "count" || habit.kind === "duration") && (
              <div className="flex items-center gap-3 border-t border-border px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base leading-tight text-fg">Daily target</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">{habit.target} {habit.unit}</div>
                </div>
                <input type="number" placeholder={String(habit.target)}
                  className="w-20 rounded-[8px] border border-border bg-bg px-2 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle" />
              </div>
            )}
          </Card>
        </Section>

        <Section title="Notes" meta={habit.notes.length ? `${habit.notes.length}` : ""}>
          <Card>
            {habit.notes.length === 0 && <div className="px-3.5 py-3 text-sm text-muted">No notes yet. Add one for today below.</div>}
            {habit.notes.map((n, i) => (
              <div key={i} className="border-t border-border px-3.5 py-3 first:border-t-0">
                <div className="font-mono text-[11px] text-subtle">
                  {new Date(n.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div className="mt-1 text-base leading-snug text-fg">{n.text}</div>
              </div>
            ))}
            <Input value="" onChange={() => {}} placeholder="Add a note for today"
              leading={<span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] border-dashed border-border-strong text-subtle"><PlusIcon /></span>} />
          </Card>
        </Section>

        <Section title="Danger zone">
          <Card>
            <button className="w-full px-3.5 py-3 text-left text-base text-fg hover:bg-surface-2">Archive habit</button>
            <button className="w-full border-t border-border px-3.5 py-3 text-left text-base text-subtle hover:bg-surface-2 hover:text-fg">Delete habit and history</button>
          </Card>
        </Section>
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-l border-border px-3 py-3.5 first:border-l-0">
      <div className="text-xs uppercase tracking-[0.04em] text-muted">{label}</div>
      <div className={`font-mono text-[16.5px] tracking-[-0.01em] ${accent ? "text-accent-fg" : "text-fg"}`}>{value}</div>
    </div>
  );
}

// Extend the 30-day seed out to 12 weeks for the detail heatmap.
function buildLongHistory(habit) {
  const days = 84;
  const byDate = new Map(habit.history.map((d) => [d.date, d.r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = T - i * DAY;
    if (byDate.has(date)) { out.push({ date, r: byDate.get(date) }); continue; }
    const dow = new Date(date).getDay();
    if (habit.schedule.mode === "weekdays" && !habit.schedule.days.includes(dow)) { out.push({ date, r: null }); continue; }
    if (habit.schedule.mode === "perWeek" && i % 3 !== 0) { out.push({ date, r: null }); continue; }
    const n = (i * 7919) % 100;
    out.push({ date, r: n < 18 ? 0 : n < 30 ? 0.55 : 1 });
  }
  return out;
}

Object.assign(window, { HabitDetail, buildLongHistory, StatCell });
