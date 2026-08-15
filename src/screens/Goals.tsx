import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import type { Goal } from "../db/types";
import {
  TERM_LABELS,
  TERM_ORDER,
  formatDeadline,
  markGoalComplete,
  reactivateGoal,
} from "../lib/goals";
import GoalSheet, { type GoalSheetTarget } from "../components/GoalSheet";

// Panel form — no header or scroll wrapper of its own. The parent screen
// (Habits.tsx, when the Goals toggle is active) provides those.
export default function GoalsPanel() {
  const goals =
    useLiveQuery(
      () => db.goals.orderBy("createdAt").reverse().toArray(),
    ) ?? [];

  const [target, setTarget] = useState<GoalSheetTarget | null>(null);

  const active = goals.filter((g) => g.status !== "completed");
  const completed = goals.filter((g) => g.status === "completed");

  return (
    <>
      <button
        onClick={() => setTarget("new")}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
        aria-label="New goal"
      >
        <PlusIcon /> New goal
      </button>

      {goals.length === 0 && (
        <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
          No goals yet — tap "New goal" above to add your first one.
        </div>
      )}

      {TERM_ORDER.map((termKey) => {
        const list = active.filter((g) => g.term === termKey);
        if (goals.length === 0) return null;
        return (
          <Section
            key={termKey}
            title={TERM_LABELS[termKey]}
            meta={list.length === 0 ? "" : `${list.length}`}
          >
            <Card>
              {list.length === 0 ? (
                <div className="px-3.5 py-3 text-sm text-muted">
                  No {termKey === "mid" ? "mid-term" : termKey + "-term"}{" "}
                  goals.
                </div>
              ) : (
                list.map((g) => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    onOpen={() => setTarget(g.id!)}
                  />
                ))
              )}
            </Card>
          </Section>
        );
      })}

      {completed.length > 0 && (
        <Section title="Completed" meta={`${completed.length}`}>
          <Card>
            {completed.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                onOpen={() => setTarget(g.id!)}
              />
            ))}
          </Card>
        </Section>
      )}

      {target !== null && (
        <GoalSheet target={target} onClose={() => setTarget(null)} />
      )}
    </>
  );
}

/* -------------------- Goal row -------------------- */

function GoalRow({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const completed = goal.status === "completed";

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed) reactivateGoal(goal.id!);
    else markGoalComplete(goal.id!);
  };

  const deadlineStr = goal.targetDate ? formatDeadline(goal.targetDate) : null;

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 first:border-t-0 hover:bg-surface-2"
    >
      <button
        onClick={toggle}
        aria-label={completed ? "Reactivate" : "Mark complete"}
        className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
          completed ? "border-accent bg-accent" : "border-border-strong"
        }`}
      >
        {completed && <CheckIcon />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`text-base leading-tight ${
            completed ? "text-subtle line-through" : "text-fg"
          }`}
        >
          {goal.title}
        </div>
        {(goal.description || deadlineStr) && (
          <div className="mt-0.5 truncate text-xs text-muted">
            {goal.description && (
              <span>{truncate(goal.description, 60)}</span>
            )}
            {goal.description && deadlineStr && <span> · </span>}
            {deadlineStr && (
              <span className="font-mono">{deadlineStr}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
