// LifeOS — Home, Calendar, Chat
const { useState: uS1, useEffect: uE1, useRef: uR1, useMemo: uM1 } = React;

function Home({ onOpenMetric, onOpenHabits, tasks, setTasks, habits }) {
  const [taskDraft, setTaskDraft] = uS1("");

  const tomorrow = MOCK.events
    .filter((e) => sameDay(e.start, new Date(T + DAY)))
    .sort((a, b) => a.start - b.start);

  const today = new Date();
  const dayName = today.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = today.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const subtitle = `${tomorrow.length} ${tomorrow.length === 1 ? "event" : "events"} tomorrow`;
  const tasksLeft = tasks.filter((t) => t.status !== "completed").length;

  const addTask = () => {
    const title = taskDraft.trim(); if (!title) return;
    setTasks([{ id: Date.now(), title, status: "pending" }, ...tasks]); setTaskDraft("");
  };
  const toggleTask = (t) => setTasks(tasks.map((x) => x.id === t.id ? { ...x, status: x.status === "completed" ? "pending" : "completed" } : x));
  const deleteTask = (id) => setTasks(tasks.filter((x) => x.id !== id));

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-end justify-between px-1.5 pb-[18px] pt-3.5">
          <div>
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">{dayName}<br/>{monthDay}</h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{subtitle}</div>
          </div>
          <div className="text-right font-mono text-xs leading-relaxed tracking-[0.02em] text-subtle">
            next up<br/><b className="font-medium text-fg">{fmtTime(tomorrow[0].start)}</b>
          </div>
        </div>

        <Section title="Tomorrow" meta={`${tomorrow.length} events`}>
          <Card>
            {tomorrow.map((s) => (
              <div key={s.id} className="grid grid-cols-[56px_1fr] border-t border-border px-3.5 py-3 first:border-t-0">
                <div className="pt-px font-mono text-xs tracking-[0.01em] text-muted">{fmtTime(s.start)}</div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-subtle" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base leading-tight">{s.title}</div>
                    {s.location && <div className="mt-0.5 text-xs text-muted">{s.location}</div>}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        <Section title="Tasks · this week" meta={`${tasksLeft} left`}>
          <Card>
            {tasks.map((t) => (
              <ListRow key={t.id} done={t.status === "completed"}
                leading={
                  <button onClick={() => toggleTask(t)} className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${t.status === "completed" ? "border-accent bg-accent" : "border-border-strong"}`}>
                    {t.status === "completed" && <CheckIcon />}
                  </button>}
                title={t.title} sub={t.description}
                trailing={<IconButton label="Delete" onClick={() => deleteTask(t.id)} className="opacity-50"><XIcon /></IconButton>} />
            ))}
            <Input value={taskDraft} onChange={setTaskDraft} onSubmit={addTask} placeholder="Add a task"
              leading={<span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] border-dashed border-border-strong text-subtle"><PlusIcon /></span>} />
          </Card>
        </Section>

        <HabitRingRow habits={habits} onOpen={onOpenHabits} />

        <Section title="Today's stats">
          <div className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-border bg-surface">
            {["water", "sleep", "calories"].map((m) => <StatTile key={m} metric={m} onClick={() => onOpenMetric(m)} />)}
          </div>
        </Section>

        <Section title="Weekly review">
          <button className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg"><ScrollIcon /></span>
            <div className="min-w-0 flex-1">
              <div className="text-base leading-tight text-fg">Read this week's review</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">Last generated 2d ago</div>
            </div>
            <span className="text-subtle">›</span>
          </button>
        </Section>

        <Section title="Settings">
          <div className="space-y-2">
            <button className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg"><BellIcon /></span>
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">Notifications</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">On · weight + sleep 9:30 AM · habits 9:30 PM ET</div>
              </div>
              <span className="text-subtle">On</span>
            </button>
            <button className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-2 text-subtle"><BackupIcon /></span>
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight text-fg">Backup &amp; restore</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">Last backed up 3 days ago.</div>
              </div>
              <span className="text-subtle">›</span>
            </button>
          </div>
        </Section>

        <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
          {tasks.length} tasks · {habits.length} habits
        </div>

      </div>
    </div>
  );
}

// Thin progress-ring row — no names, taps through to the Habits tab.
function HabitRingRow({ habits, onOpen }) {
  const scheduled = habits.filter((h) => isScheduledToday(h));
  const done = scheduled.filter((h) => progressOf(h) >= 1).length;
  return (
    <Section title="Habits" meta={`${done}/${scheduled.length} today`}>
      <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3.5 text-left hover:border-border-strong active:scale-[0.99]">
        <div className="flex flex-1 items-center gap-3">
          {scheduled.map((h) => {
            const pct = progressOf(h);
            const r = 15, c = 2 * Math.PI * r;
            const broken = h.kind === "avoid" && !h.today;
            return (
              <div key={h.id} className="relative" style={{ width: 34, height: 34 }} title={h.name}>
                <svg width="34" height="34" className="block -rotate-90">
                  <circle cx="17" cy="17" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="3" />
                  <circle cx="17" cy="17" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
                    stroke={broken ? "var(--color-subtle)" : "var(--color-accent)"}
                    strokeDasharray={`${c * pct} ${c}`} />
                </svg>
                {pct >= 1 && (
                  <span className="absolute inset-0 grid place-items-center text-accent-fg">
                    <svg width="10" height="10" viewBox="0 0 13 13" fill="none"><path d="M2 6.8 L5 9.5 L11 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <span className="text-subtle">›</span>
      </button>
    </Section>
  );
}

function StatTile({ metric, onClick }) {
  const config = METRIC_CONFIG[metric];
  const value = MOCK.metrics[metric];
  const goal = MOCK.goalsMeta[metric];
  const streak = MOCK.streaks[metric];
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <button onClick={onClick} className="flex min-w-0 flex-col gap-1 border-l border-border px-3.5 py-3.5 text-left transition first:border-l-0 hover:bg-surface-2 active:scale-[0.99]">
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-xs uppercase tracking-[0.04em] text-muted">{metric}</div>
        {streak > 0 && <span className={`font-mono text-[10px] ${streak >= 7 ? "text-accent-fg" : "text-muted"}`}>{streak}d</span>}
      </div>
      <div className="font-mono text-[16.5px] tracking-[-0.01em]">
        {config.format(value)}{config.unit && <span className="ml-px text-sm text-muted">{config.unit}</span>}
        <span className="ml-1 text-xs text-subtle"> / {config.format(goal)}{config.unit}</span>
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
        <span className="block h-full rounded-[inherit] bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────
function CalendarScreen() {
  const [cursor, setCursor] = uS1(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = uS1(() => new Date(T + DAY));
  const events = MOCK.events;
  const monthName = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = new Date();
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, hasEvents: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    cells.push({ date, hasEvents: events.some((e) => sameDay(e.start, date)) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, hasEvents: false });

  const eventsOfSelected = events.filter((e) => sameDay(e.start, selected)).sort((a, b) => a.start - b.start);
  const selectedTitle = selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const monthEvents = events.filter((e) => e.start.getMonth() === cursor.getMonth() && e.start.getFullYear() === cursor.getFullYear());

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="flex items-center justify-between px-1.5 pb-4 pt-3.5">
          <div>
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">{monthName}</h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">{monthEvents.length} events</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"><ChevronLeft /></button>
            <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(d); }} className="rounded-[8px] px-2 py-1 font-mono text-xs uppercase tracking-[0.04em] text-subtle hover:text-fg">today</button>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"><ChevronRight /></button>
          </div>
        </header>

        <Card>
          <div className="grid grid-cols-7 px-2 pb-1 pt-3">
            {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="text-center text-[10px] uppercase tracking-[0.08em] text-subtle">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 px-2 pb-3 pt-1">
            {cells.map((cell, i) => {
              if (!cell.date) return <div key={i} className="h-9" />;
              const isToday = sameDay(cell.date, today);
              const isSelected = sameDay(cell.date, selected);
              return (
                <button key={i} onClick={() => setSelected(cell.date)} className={`relative grid h-9 place-items-center rounded-[8px] text-sm transition ${isSelected ? "bg-accent font-medium text-[#0a160d]" : isToday ? "border border-accent text-fg" : "text-fg hover:bg-surface-2"}`}>
                  {cell.date.getDate()}
                  {cell.hasEvents && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="mt-[22px]">
          <Section title={selectedTitle} meta={`${eventsOfSelected.length} ${eventsOfSelected.length === 1 ? "event" : "events"}`}>
            <Card>
              {eventsOfSelected.length === 0 && <div className="px-3.5 py-4 text-sm text-muted">No events.</div>}
              {eventsOfSelected.map((e) => (
                <div key={e.id} className="group grid grid-cols-[56px_1fr_36px] border-t border-border px-3.5 py-3 first:border-t-0">
                  <div className="pt-px font-mono text-xs tracking-[0.01em] text-muted">{fmtTime(e.start)}</div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-subtle" />
                    <div className="min-w-0 flex-1">
                      <div className="text-base leading-tight">
                        {e.title}
                        {e.recurringEventId && <span className="ml-1.5 rounded-[5px] border border-border bg-surface px-1 py-0.5 align-middle font-mono text-[9px] text-subtle">↻</span>}
                      </div>
                      {e.location && <div className="mt-0.5 text-xs text-muted">{e.location}</div>}
                    </div>
                  </div>
                  <button aria-label="Delete" className="grid h-7 w-7 place-self-start place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"><XIcon /></button>
                </div>
              ))}
            </Card>
          </Section>

          <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]">
            <PlusIcon14 /> Add event on {selected.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chat sheet ───────────────────────────────────────────────────────
function ChatSheet({ onClose, coachKey }) {
  const coach = COACHES[coachKey];
  const [shown, setShown] = uS1(false);
  const [draft, setDraft] = uS1("");
  const [thinking, setThinking] = uS1(false);
  const [streaming, setStreaming] = uS1(null);
  const [messages, setMessages] = uS1(() => SEED_CHAT[coachKey] || []);
  const bodyRef = uR1(null);

  uE1(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  uE1(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages.length, streaming, thinking]);

  const close = () => { setShown(false); window.setTimeout(onClose, 280); };

  const send = () => {
    const t = draft.trim(); if (!t || thinking || streaming !== null) return;
    setDraft(""); setMessages((m) => [...m, { id: Date.now(), role: "user", content: t }]); setThinking(true);
    const reply = "On it. I'll pull that together and update the relevant screen — check back in a moment.";
    setTimeout(() => {
      setThinking(false);
      let i = 0;
      const tick = setInterval(() => {
        i += 3;
        setStreaming(reply.slice(0, i));
        if (i >= reply.length) {
          clearInterval(tick);
          setStreaming(null);
          setMessages((m) => [...m, { id: Date.now() + 1, role: "assistant", content: reply }]);
        }
      }, 26);
    }, 700);
  };
  const canSend = !!draft.trim() && !thinking && streaming === null;

  return (
    <React.Fragment>
      <div onClick={close} className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div className={`absolute inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${shown ? "translate-y-0" : "translate-y-full"}`} style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button className="px-1.5 py-1 text-sm text-muted hover:text-fg">Clear</button>
          <span className="truncate text-sm font-medium uppercase tracking-[0.04em] text-muted">{coach.label}</span>
          <button onClick={close} className="px-1.5 py-1 text-base text-accent-fg">Done</button>
        </div>
        <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-2 [&::-webkit-scrollbar]:hidden">
          {messages.length === 0 && !streaming && !thinking && (
            <div className="my-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">ask anything</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[84%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2.5 text-base leading-snug ${m.role === "user" ? "self-end rounded-br-[6px] bg-accent text-[#0a160d]" : "self-start rounded-bl-[6px] border border-border bg-surface text-fg"}`}>
              {m.content}
            </div>
          ))}
          {streaming !== null && (
            <div className="max-w-[84%] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[6px] border border-border bg-surface px-3.5 py-2.5 text-base leading-snug text-fg">
              {streaming}<span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-muted" />
            </div>
          )}
          {thinking && (
            <div className="max-w-[84%] self-start rounded-[18px] rounded-bl-[6px] border border-border bg-surface px-3.5 py-2.5">
              <span className="inline-flex gap-1"><Dot /><Dot delay={0.15} /><Dot delay={0.3} /></span>
            </div>
          )}
        </div>
        <div className="border-t border-border px-3.5 pb-[22px] pt-2.5">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-surface pl-4 pr-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={coach.placeholder} className="flex-1 bg-transparent text-base outline-none placeholder:text-subtle" />
            <button type="submit" disabled={!canSend} className={`grid h-8 w-8 place-items-center rounded-full transition ${canSend ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"}`}><ArrowUp /></button>
          </form>
        </div>
      </div>
    </React.Fragment>
  );
}

function Dot({ delay = 0 }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" style={{ animation: `blink 1.2s ${delay}s infinite ease-in-out` }} />;
}

const SEED_CHAT = {
  home: [
    { id: 1, role: "user", content: "What's tomorrow look like?" },
    { id: 2, role: "assistant", content: "Four things: standup 9:30, design review 11:00, dentist 2:00 at Westside, dinner with Caro & Sam 7:30 at Tabu.\n\nThe dentist is 25 min from your 11:00 — you're fine, but you'll want to leave the office by 1:30." },
  ],
  fitness: [
    { id: 1, role: "user", content: "Am I on track this week?" },
    { id: 2, role: "assistant", content: "Three lifts in (Push, Pull, Legs) and 58 min of cardio. You're one Zone 2 session short of target and HIIT is done.\n\nPush A yesterday had 2 PRs — incline DB press 70×8 and cable fly 45×12. Nice." },
  ],
  macros: [
    { id: 1, role: "user", content: "What should I eat for dinner?" },
    { id: 2, role: "assistant", content: "You've got 945 kcal and 37g protein left. Something like 8oz salmon, a cup of rice, and roasted broccoli lands you at ~720 kcal / 48g protein — puts you right on target with room for a snack." },
  ],
  health: [],
  goals: [],
};

Object.assign(window, { Home, StatTile, HabitRingRow, CalendarScreen, ChatSheet, Dot });
