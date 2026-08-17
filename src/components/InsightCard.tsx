import type { Insight, InsightAction } from "../db/types";
import { dismissInsight, acceptInsight } from "../lib/insights/engine";

// Small rectangular card that renders one Insight inline in whatever screen
// its `surface` is bound to. Deliberately understated — no badges, no red
// dots, no counters (spec §6: "If it isn't worth reading inline, it isn't
// worth generating"). Severity nudges the accent color only.
//
// Actions are executable from the card; dismiss is always available. In
// Phase 1 we don't have any real actions yet — dismiss is the only path.
export default function InsightCard({
  insight,
  onAction,
}: {
  insight: Insight;
  // Fires after a non-dismiss action runs. Parent decides what happens next
  // (navigate to a tab, close the card, run a Dexie mutation, etc.). Phase 1
  // has no actions so this stays unused for now.
  onAction?: (action: InsightAction, insight: Insight) => void;
}) {
  const handleDismiss = () => {
    if (insight.id !== undefined) void dismissInsight(insight.id);
  };

  const handleAction = (action: InsightAction) => {
    if (action.kind === "dismiss") {
      handleDismiss();
      return;
    }
    if (insight.id !== undefined) void acceptInsight(insight.id);
    onAction?.(action, insight);
  };

  // Severity accent — matches the existing accent-soft / accent-fg tokens
  // used elsewhere (see WeeklyReviewButton in Home.tsx). Urgent bumps to a
  // stronger border so it reads as "worth pushing" without shouting.
  const accentBorder =
    insight.severity === "urgent"
      ? "border-accent"
      : insight.severity === "notable"
        ? "border-border-strong"
        : "border-border";

  return (
    <div
      className={`overflow-hidden rounded-[16px] border bg-surface ${accentBorder}`}
    >
      <div className="px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium leading-tight text-fg">
              {insight.title}
            </div>
            <div className="mt-1 text-[13px] leading-snug text-muted">
              {insight.body}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
          >
            <XIcon />
          </button>
        </div>

        {insight.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {insight.actions.map((action, i) => (
              <button
                key={i}
                onClick={() => handleAction(action)}
                className="rounded-[10px] bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-fg hover:bg-border active:scale-[0.99]"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path
      d="M2 2l7 7M9 2l-7 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
