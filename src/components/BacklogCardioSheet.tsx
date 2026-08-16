import { useEffect, useState } from "react";
import type { CardioKind } from "../db/types";
import { addCardioSession } from "../lib/cardio";

interface Props {
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function BacklogCardioSheet({ onClose }: Props) {
  const [shown, setShown] = useState(false);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => setInteractive(true), 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dateStr, setDateStr] = useState(() => toDateInput(new Date()));
  const [kind, setKind] = useState<CardioKind>("liss");
  const [duration, setDuration] = useState(kind === "liss" ? "40" : "20");
  const [modality, setModality] = useState("");
  const [busy, setBusy] = useState(false);

  const parsedDur = parseFloat(duration);
  const durValid = !Number.isNaN(parsedDur) && parsedDur > 0;
  const valid = !!dateStr && durValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateMs = new Date(y, m - 1, d, 12, 0, 0).getTime();
      await addCardioSession({
        kind,
        durationMin: parsedDur,
        modality: modality.trim() || undefined,
        date: dateMs,
      });
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={interactive ? close : undefined}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        } ${interactive ? "" : "pointer-events-none"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Log past cardio
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-[18px] pb-6 pt-2"
        >
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Date
            </span>
            <input
              type="date"
              value={dateStr}
              max={toDateInput(new Date())}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              Kind
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["liss", "hiit"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setDuration(k === "liss" ? "40" : "20");
                  }}
                  className={`rounded-[10px] border px-3 py-2 text-left ${
                    kind === k
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      kind === k ? "text-accent-fg" : "text-fg"
                    }`}
                  >
                    {k === "liss" ? "Zone 2" : "HIIT"}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted">
                    {k === "liss" ? "Steady state" : "Intervals"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Duration (minutes)
            </span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Modality (optional)
            </span>
            <input
              type="text"
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              placeholder="incline walk / bike / rower"
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
          </label>

          <button
            type="submit"
            disabled={!valid || busy}
            className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
              valid && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            Log session
          </button>
        </form>
      </div>
    </>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
