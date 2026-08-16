import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { DAILY_TAGS, upsertDailyLog } from "../lib/dailyLog";
import { startOfDay } from "../lib/habits";
import { Section } from "./primitives";

// "What did you do today?" — tag chips + freeform text, auto-saved 800ms
// after the last keystroke so the user never taps a save button.
export default function DailyPromptCard() {
  const today = startOfDay();
  const existing = useLiveQuery(
    () => db.daily_logs.where("date").equals(today).first(),
    [today],
  );

  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // Guard so the first hydration from Dexie doesn't overwrite what the user
  // just typed (in the tiny window between remote load and local state).
  const hydrated = useRef(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Hydrate from Dexie once we know if a row exists for today. If none, stay
  // with the blank defaults so the user can start typing.
  useEffect(() => {
    if (hydrated.current) return;
    if (existing === undefined) return; // still loading
    if (existing) {
      setText(existing.text ?? "");
      setTags(existing.tags ?? []);
    }
    hydrated.current = true;
  }, [existing]);

  // Debounced auto-save. Skip until hydrated to avoid saving the blank
  // defaults over an existing row.
  useEffect(() => {
    if (!hydrated.current) return;
    if (text === "" && tags.length === 0 && !existing) return;
    setStatus("saving");
    const id = window.setTimeout(() => {
      upsertDailyLog(text, tags, today).then(() => {
        setStatus("saved");
        window.setTimeout(() => setStatus("idle"), 1200);
      });
    }, 800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, tags, today]);

  const toggleTag = (key: string) => {
    setTags((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  };

  const meta = useMemo(() => {
    if (status === "saving") return "saving…";
    if (status === "saved") return "saved";
    if (existing?.updatedAt) {
      const min = Math.floor((Date.now() - existing.updatedAt) / 60_000);
      if (min < 1) return "just now";
      if (min < 60) return `${min}m ago`;
      const h = Math.floor(min / 60);
      if (h < 24) return `${h}h ago`;
      return "";
    }
    return "";
  }, [status, existing?.updatedAt]);

  return (
    <Section title="Today" meta={meta}>
      <div className="rounded-[16px] border border-border bg-surface p-3.5">
        <div className="grid grid-cols-4 gap-2">
          {DAILY_TAGS.map((t) => {
            const active = tags.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTag(t.key)}
                className="rounded-[10px] py-2 text-center text-xs font-medium transition"
                style={{
                  background: active ? t.color : "var(--color-surface-2)",
                  color: active ? "#fff" : "var(--color-fg)",
                  boxShadow: active ? "none" : `inset 0 0 0 1px ${t.color}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you do today?"
          rows={3}
          className="mt-3 w-full resize-none rounded-[10px] border border-border bg-bg p-3 text-sm leading-snug outline-none placeholder:text-subtle"
        />
        <button
          onClick={async () => {
            setStatus("saving");
            await upsertDailyLog(text, tags, today);
            setStatus("saved");
            window.setTimeout(() => setStatus("idle"), 1200);
          }}
          className="mt-3 w-full rounded-[10px] bg-accent py-2 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
        >
          Submit
        </button>
      </div>
    </Section>
  );
}
