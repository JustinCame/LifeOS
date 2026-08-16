import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Goal, GoalTerm } from "../db/types";
import {
  TERM_HINTS,
  TERM_LABELS,
  TERM_ORDER,
  addGoal,
  addJournalEntry,
  deleteGoal,
  deleteJournalEntry,
  formatDeadline,
  formatJournalDate,
  markGoalComplete,
  reactivateGoal,
  updateGoal,
} from "../lib/goals";

export type GoalSheetTarget = number | "new";

interface Props {
  // Parent only mounts when actually editing — no "closed" state inside.
  target: GoalSheetTarget;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function GoalSheet({ target, onClose }: Props) {
  const id = typeof target === "number" ? target : null;
  const isCreating = target === "new";

  // Slide-in animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const idAnim = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(idAnim);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const goal = useLiveQuery(
    () => (id !== null ? db.goals.get(id) : Promise.resolve(undefined)),
    [id],
  );
  const journal =
    useLiveQuery(async () => {
      if (id === null) return [];
      const entries = await db.goal_journal.where("goalId").equals(id).toArray();
      return entries.sort((a, b) => b.createdAt - a.createdAt);
    }, [id]) ?? [];

  // Form state — used both for new and edit modes.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [term, setTerm] = useState<GoalTerm>("mid");
  const [targetDate, setTargetDate] = useState("");
  const [editing, setEditing] = useState(false);
  const [journalDraft, setJournalDraft] = useState("");

  // Initialize form when the sheet mounts or the underlying goal loads.
  useEffect(() => {
    if (isCreating) {
      setTitle("");
      setDescription("");
      setTerm("mid");
      setTargetDate("");
      setEditing(true);
      setJournalDraft("");
    } else if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setTerm(goal.term);
      setTargetDate(
        goal.targetDate
          ? new Date(goal.targetDate).toISOString().slice(0, 10)
          : "",
      );
      setEditing(false);
      setJournalDraft("");
    }
  }, [isCreating, goal]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const targetMs = targetDate
      ? new Date(targetDate + "T00:00:00").getTime()
      : undefined;
    if (isCreating) {
      await addGoal({
        title: t,
        description: description.trim() || undefined,
        term,
        targetDate: targetMs,
      });
      close();
    } else if (id !== null) {
      await updateGoal(id, {
        title: t,
        description: description.trim() || undefined,
        term,
        targetDate: targetMs,
      });
      setEditing(false);
    }
  };

  const onJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (id === null || !journalDraft.trim()) return;
    await addJournalEntry(id, journalDraft);
    setJournalDraft("");
  };

  const onDelete = async () => {
    if (id === null) return;
    if (
      !confirm(
        `Delete "${goal?.title ?? "this goal"}"? Removes all journal entries too.`,
      )
    )
      return;
    await deleteGoal(id);
    onClose();
  };

  const onToggleComplete = async () => {
    if (id === null || !goal) return;
    if (goal.status === "completed") await reactivateGoal(id);
    else await markGoalComplete(id);
  };

  const headerLabel = isCreating
    ? "New goal"
    : editing
    ? "Edit goal"
    : goal?.status === "completed"
    ? "Completed goal"
    : "Goal";

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {headerLabel}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {(isCreating || editing) ? (
            <GoalForm
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              term={term}
              setTerm={setTerm}
              targetDate={targetDate}
              setTargetDate={setTargetDate}
              isCreating={isCreating}
              onSubmit={onSave}
              onCancel={isCreating ? undefined : () => setEditing(false)}
            />
          ) : goal ? (
            <GoalDetail
              goal={goal}
              journal={journal}
              journalDraft={journalDraft}
              setJournalDraft={setJournalDraft}
              onJournal={onJournal}
              onEdit={() => setEditing(true)}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
              onDeleteEntry={(eid) => deleteJournalEntry(eid)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/* -------------------- Form -------------------- */

function GoalForm({
  title, setTitle, description, setDescription, term, setTerm, targetDate, setTargetDate,
  isCreating, onSubmit, onCancel,
}: {
  title: string; setTitle: (s: string) => void;
  description: string; setDescription: (s: string) => void;
  term: GoalTerm; setTerm: (t: GoalTerm) => void;
  targetDate: string; setTargetDate: (s: string) => void;
  isCreating: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 pt-2">
      <Field
        label="Name"
        value={title}
        onChange={setTitle}
        placeholder="Deadlift 405 by year-end"
        autoFocus={isCreating}
      />
      <Field
        label="Short description (optional)"
        value={description}
        onChange={setDescription}
        placeholder="Why this matters / how I'll do it"
        textarea
      />

      <div>
        <span className="mb-1.5 block text-xs uppercase tracking-[0.06em] text-muted">
          Term
        </span>
        <div className="grid grid-cols-3 gap-2">
          {TERM_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t)}
              className={`rounded-[10px] border px-2 py-2 text-left transition ${
                term === t
                  ? "border-accent bg-accent-soft text-accent-fg"
                  : "border-border bg-surface text-fg hover:border-border-strong"
              }`}
            >
              <div className="text-sm font-medium">{TERM_LABELS[t]}</div>
              <div className="font-mono text-[10px] text-muted">
                {TERM_HINTS[t]}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Deadline (optional)"
        value={targetDate}
        onChange={setTargetDate}
        type="date"
      />

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={!title.trim()}
          className={`flex-1 rounded-[10px] py-2.5 text-sm font-medium transition ${
            title.trim()
              ? "bg-accent text-[#0a160d]"
              : "bg-surface-2 text-subtle"
          }`}
        >
          {isCreating ? "Create" : "Save"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm text-subtle hover:text-fg"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, textarea, type, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
  autoFocus?: boolean;
}) {
  const className =
    "w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle";
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${className} min-h-[60px] resize-none`}
        />
      ) : (
        <input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={className}
        />
      )}
    </label>
  );
}

/* -------------------- Detail view -------------------- */

function GoalDetail({
  goal, journal, journalDraft, setJournalDraft, onJournal,
  onEdit, onDelete, onToggleComplete, onDeleteEntry,
}: {
  goal: Goal;
  journal: { id?: number; goalId: number; text: string; createdAt: number }[];
  journalDraft: string;
  setJournalDraft: (s: string) => void;
  onJournal: (e: React.FormEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onDeleteEntry: (id: number) => void;
}) {
  const completed = goal.status === "completed";
  return (
    <div className="space-y-4 pt-1">
      <div>
        <div
          className={`text-2xl font-medium leading-tight tracking-[-0.02em] ${
            completed ? "text-subtle line-through" : "text-fg"
          }`}
        >
          {goal.title}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-[6px] border border-border bg-surface px-2 py-0.5 text-xs text-muted">
            {TERM_LABELS[goal.term]}
          </span>
          {goal.targetDate && (
            <span className="font-mono text-xs text-muted">
              {formatDeadline(goal.targetDate)}
            </span>
          )}
          {completed && (
            <span className="rounded-[6px] bg-accent-soft px-2 py-0.5 text-xs text-accent-fg">
              ✓ Completed
            </span>
          )}
        </div>
        {goal.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {goal.description}
          </p>
        )}
      </div>

      <ProgressEditor goal={goal} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onToggleComplete}
          className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
            completed
              ? "border border-border bg-surface text-fg hover:border-border-strong"
              : "bg-accent text-[#0a160d]"
          }`}
        >
          {completed ? "Reactivate" : "Mark complete"}
        </button>
        <button
          onClick={onEdit}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 text-sm text-fg hover:border-border-strong"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 text-sm text-subtle hover:text-fg"
        >
          Delete
        </button>
      </div>

      <div className="pt-2">
        <div className="mb-2 text-xs uppercase tracking-[0.06em] text-muted">
          Progress journal
        </div>

        <form onSubmit={onJournal} className="mb-3 flex gap-2">
          <input
            value={journalDraft}
            onChange={(e) => setJournalDraft(e.target.value)}
            placeholder="What's the latest?"
            className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            disabled={!journalDraft.trim()}
            className={`rounded-[10px] px-3 py-2 text-sm font-medium transition ${
              journalDraft.trim()
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            Log
          </button>
        </form>

        {journal.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-5 text-center text-sm text-muted">
            No entries yet.
          </div>
        ) : (
          <div className="space-y-2">
            {journal.map((entry) => (
              <div
                key={entry.id}
                className="group rounded-[12px] border border-border bg-surface px-3.5 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">
                    {formatJournalDate(entry.createdAt)}
                  </div>
                  <button
                    onClick={() => entry.id && onDeleteEntry(entry.id)}
                    className="text-xs text-subtle opacity-50 hover:opacity-100"
                    aria-label="Delete entry"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg">
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Progress editor -------------------- */

// Manual progress slider (0-100). Writes to goal.progress on release so
// dragging doesn't spam Dexie mid-swipe. Quick-set chips for the common
// milestones so it's tap-friendly on mobile.
function ProgressEditor({ goal }: { goal: Goal }) {
  const pct = Math.max(0, Math.min(100, Math.round(goal.progress ?? 0)));
  const [draft, setDraft] = useState(pct);
  useEffect(() => setDraft(pct), [pct]);

  const commit = async (v: number) => {
    const next = Math.max(0, Math.min(100, Math.round(v)));
    setDraft(next);
    if (goal.id !== undefined) {
      await updateGoal(goal.id, { progress: next });
    }
  };

  const disabled = goal.status === "completed";

  return (
    <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Progress
        </div>
        <div
          className={`font-mono text-sm ${
            draft >= 100 ? "text-accent-fg" : "text-fg"
          }`}
        >
          {draft}%
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(parseInt(e.target.value, 10))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        className="mt-2 w-full accent-[var(--color-accent)] disabled:opacity-40"
      />
      <div className="mt-2 flex gap-1.5">
        {[0, 25, 50, 75, 100].map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => commit(v)}
            className={`flex-1 rounded-[6px] px-2 py-1 font-mono text-[10px] transition ${
              draft === v
                ? "bg-accent-soft text-accent-fg"
                : "border border-border bg-bg text-subtle hover:border-border-strong hover:text-fg"
            } disabled:opacity-40`}
          >
            {v}%
          </button>
        ))}
      </div>
    </div>
  );
}
