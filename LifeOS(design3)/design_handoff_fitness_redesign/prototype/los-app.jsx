// LifeOS — app shell, tab bar, iOS frame mount
const { useState: uS3 } = React;

function tabToCoachKey(tab) {
  switch (tab) {
    case "fitness": return "fitness";
    case "macros": return "macros";
    case "health": return "health";
    case "habits": return "goals";
    default: return "home";
  }
}

function LifeOSApp({ dark, onToggleTheme }) {
  const [tab, setTab] = uS3("home");
  const [chatOpen, setChatOpen] = uS3(false);
  const [metricSheet, setMetricSheet] = uS3(null);
  const [tasks, setTasks] = uS3(MOCK.tasks);
  const [habits, setHabits] = uS3(HABITS_SEED);
  const [detailId, setDetailId] = uS3(null);
  const detailHabit = habits.find((h) => h.id === detailId) || null;

  const setHabitValue = (v) => setHabits(habits.map((h) => (h.id === detailId ? { ...h, today: v } : h)));
  const setHabitSchedule = (mode) => setHabits(habits.map((h) => {
    if (h.id !== detailId) return h;
    const s = mode === "weekdays" ? { mode, days: h.schedule.days || [1, 3, 5] }
      : mode === "perWeek" ? { mode, perWeek: h.schedule.perWeek || 3 }
      : { mode: "daily" };
    return { ...h, schedule: s };
  }));

  const openMetric = (m) => { if (m === "calories") setTab("macros"); else setMetricSheet(m); };

  return (
    <main className="relative h-full w-full overflow-hidden bg-bg">
      {tab === "home" ? <Home onOpenMetric={openMetric} onOpenHabits={() => setTab("habits")} tasks={tasks} setTasks={setTasks} habits={habits} />
        : tab === "calendar" ? <CalendarScreen />
        : tab === "fitness" ? <Fitness />
        : tab === "macros" ? <Macros />
        : tab === "health" ? <Health onOpenMetric={openMetric} />
        : tab === "habits" ? <HabitsScreen habits={habits} setHabits={setHabits} onOpenHabit={setDetailId} />
        : <Notes />}

      {detailHabit && (
        <HabitDetail habit={detailHabit} onClose={() => setDetailId(null)}
          onChange={setHabitValue} onScheduleChange={setHabitSchedule} />
      )}

      <ChatDock onOpen={() => setChatOpen(true)} placeholder={COACHES[tabToCoachKey(tab)].placeholder} />
      {chatOpen && <ChatSheet onClose={() => setChatOpen(false)} coachKey={tabToCoachKey(tab)} />}
      {metricSheet && <MetricSheet type={metricSheet} onClose={() => setMetricSheet(null)} />}

      <TabBar value={tab} onChange={setTab} />

      <button onClick={onToggleTheme} aria-label="Toggle theme"
        className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface/70 text-subtle backdrop-blur hover:border-border-strong hover:text-fg">
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </main>
  );
}

function MetricSheet({ type, onClose }) {
  const cfg = METRIC_CONFIG[type];
  const value = MOCK.metrics[type], goal = MOCK.goalsMeta[type];
  const quickAdds = type === "water" ? [0.25, 0.5, 1] : type === "calories" ? [100, 250, 500] : [];
  return (
    <React.Fragment>
      <div onClick={onClose} className="absolute inset-0 z-40 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[28px] border-t border-border bg-bg pb-[22px] shadow-[0_-20px_40px_rgb(0_0_0/0.32)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">{type}</span>
          <button onClick={onClose} className="px-1.5 py-1 text-base text-accent-fg">Done</button>
        </div>
        <div className="px-[18px]">
          <div className="rounded-[16px] border border-border bg-surface px-3.5 py-4">
            <div className="font-mono text-2xl text-fg">
              {cfg.format(value)}<span className="text-base text-muted">{cfg.unit}</span>
              <span className="ml-1 text-sm text-subtle"> / {cfg.format(goal)}{cfg.unit}</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-[1px] bg-surface-2">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (value / goal) * 100)}%` }} />
            </div>
            {quickAdds.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {quickAdds.map((q) => (
                  <button key={q} className="rounded-[10px] border border-border bg-bg py-2 font-mono text-sm text-fg hover:border-border-strong">+{q}{cfg.unit}</button>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input type="number" placeholder={cfg.format(value)} className="flex-1 rounded-[8px] border border-border bg-bg px-2.5 py-1.5 text-center font-mono text-sm outline-none placeholder:text-subtle" />
              <button className="rounded-[8px] bg-accent px-3 py-1.5 text-sm font-medium text-[#0a160d]">Set</button>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

function TabBar({ value, onChange }) {
  const tabs = [
    ["home", "Today", HomeIcon], ["calendar", "Calendar", CalendarIcon], ["fitness", "Fitness", DumbbellIcon],
    ["macros", "Macros", MacrosIcon], ["health", "Health", HeartIcon], ["habits", "Habits", RingIcon], ["notes", "Notes", NoteIcon],
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-bg/95 backdrop-blur-xl">
      {tabs.map(([key, label, Ico]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition ${value === key ? "text-fg" : "text-subtle hover:text-fg"}`}>
          <Ico />
          <span className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</span>
        </button>
      ))}
    </div>
  );
}

const HomeIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 8.5L10 3l7 5.5V16a1.5 1.5 0 0 1-1.5 1.5h-3v-5h-5v5h-3A1.5 1.5 0 0 1 3 16V8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const CalendarIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const DumbbellIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 8v4M5 6v8M7 10h6M13 6v8M15 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const MacrosIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 9h12c0 3.3-2.7 6-6 6s-6-2.7-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7 5.5c1 .8 1 2.2 0 3M10 4.5c1 .8 1 2.2 0 3M13 5.5c1 .8 1 2.2 0 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const TargetIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>;
const RingIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35"/><path d="M10 3.5a6.5 6.5 0 0 1 5.6 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/></svg>;
const HeartIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 16.5s-5.5-3.4-5.5-7.7A3.3 3.3 0 0 1 10 6.3a3.3 3.3 0 0 1 5.5 2.5c0 4.3-5.5 7.7-5.5 7.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
const NoteIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
const SunIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.4"/><g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1l1.1-1.1M10 4l1.1-1.1"/></g></svg>;
const MoonIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 8.6A4.6 4.6 0 0 1 5.4 2.5 4.8 4.8 0 1 0 11.5 8.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;

// ── Mount ────────────────────────────────────────────────────────────
function Root() {
  const [dark, setDark] = uS3(true);
  const [scale, setScale] = uS3(1);
  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / 844));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      const el = document.getElementById("los-scope");
      if (el) { if (next) el.removeAttribute("data-theme"); else el.setAttribute("data-theme", "light"); }
      return next;
    });
  };
  return (
    <div className="page">
      <div style={{ width: 390 * scale, height: 844 * scale }}>
        <div id="los-scope" className="device-wrap" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <IOSDevice width={390} height={844} dark={dark}>
          <LifeOSApp dark={dark} onToggleTheme={toggle} />
        </IOSDevice>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
