import { useEffect, useState } from "react";
import { exportAll, importAll } from "../lib/backup";
import { setSetting } from "../db";

interface Props {
  // Caller decides when to mount/unmount the sheet; this component only
  // exists while it's meant to be visible. No `open` prop, no CSS-transform
  // games — that pattern hit a real iOS rendering bug where the panel
  // visually showed open but pointer-events-none was applied underneath.
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function BackupSheet({ onClose }: Props) {
  const [json, setJson] = useState("");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [importDraft, setImportDraft] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    kind: "ok" | "err";
  } | null>(null);

  // Slide-in animation. Starts off-screen, transitions to visible the next
  // frame after mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Animated close — slide out, then tell the parent to unmount us.
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  // Safety net: pressing Escape always closes the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    try {
      const data = await exportAll();
      setJson(JSON.stringify(data, null, 2));
      setCounts(data.counts);
      setStatus({ text: "Backup ready. Copy the text below.", kind: "ok" });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        kind: "err",
      });
    }
  };

  const copy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      // Successful copy is our best signal the user actually has the backup
      // out of the device. We can't know they saved it somewhere, but anything
      // less than "they clicked Copy" is even weaker.
      await setSetting("lastBackupAt", Date.now());
      setStatus({ text: "Copied to clipboard.", kind: "ok" });
    } catch {
      setStatus({
        text: "Copy failed. Tap-and-hold the text to select, then copy.",
        kind: "err",
      });
    }
  };

  const restore = async () => {
    if (!importDraft.trim()) return;
    if (
      !confirm(
        "Restore will REPLACE all data on this device with the backup. Sensitive settings (API key, Google sign-in) are preserved. Continue?",
      )
    ) {
      return;
    }
    try {
      const c = await importAll(importDraft);
      const summary = summarizeCounts(c);
      setStatus({
        text: `Restored: ${summary}. Reloading…`,
        kind: "ok",
      });
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        kind: "err",
      });
    }
  };

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Backup
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {/* Status banner */}
          {status && (
            <div
              className={`mb-3 rounded-[10px] border px-3 py-2 text-xs ${
                status.kind === "ok"
                  ? "border-border bg-surface text-fg"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {status.text}
            </div>
          )}

          {/* Export section */}
          <section className="mb-6">
            <div className="mb-1 text-sm font-medium text-fg">Export</div>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Saves all your data on this device as JSON: foods, meal entries,
              tasks, habits, water/sleep logs, chat history, settings, etc.
              Paste it into a note, email it to yourself, or stash it in cloud
              storage. <span className="text-fg">Your Anthropic API key and Google sign-in are NOT included</span> — those stay on this device.
            </p>
            {!json ? (
              <button
                onClick={generate}
                className="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-[#0a160d]"
              >
                Generate backup
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  readOnly
                  value={json}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="h-40 w-full resize-none rounded-[10px] border border-border bg-surface p-3 font-mono text-[11px] text-fg outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={copy}
                    className="rounded-[10px] bg-accent px-3 py-2 text-sm font-medium text-[#0a160d]"
                  >
                    Copy to clipboard
                  </button>
                  <button
                    onClick={generate}
                    className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-fg hover:border-border-strong"
                  >
                    Refresh
                  </button>
                  {counts && (
                    <span className="ml-auto font-mono text-[11px] text-subtle">
                      {summarizeCounts(counts)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Restore section */}
          <section>
            <div className="mb-1 text-sm font-medium text-fg">Restore</div>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Paste a backup JSON to replace all data on this device.{" "}
              <span className="text-fg">
                This wipes current tasks, foods, meals, etc. on this device
              </span>{" "}
              before restoring.
            </p>
            {!showImport ? (
              <button
                onClick={() => setShowImport(true)}
                className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-fg hover:border-border-strong"
              >
                Restore from backup
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={importDraft}
                  onChange={(e) => setImportDraft(e.target.value)}
                  placeholder="Paste backup JSON here…"
                  className="h-40 w-full resize-none rounded-[10px] border border-border bg-surface p-3 font-mono text-[11px] text-fg outline-none placeholder:text-subtle"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={restore}
                    disabled={!importDraft.trim()}
                    className={`rounded-[10px] px-3 py-2 text-sm font-medium transition ${
                      importDraft.trim()
                        ? "bg-accent text-[#0a160d]"
                        : "bg-surface-2 text-subtle"
                    }`}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      setShowImport(false);
                      setImportDraft("");
                    }}
                    className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-subtle hover:border-border-strong hover:text-fg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function summarizeCounts(c: Record<string, number>): string {
  const parts: string[] = [];
  if (c.foods) parts.push(`${c.foods} foods`);
  if (c.recipes) parts.push(`${c.recipes} recipes`);
  if (c.meal_entries) parts.push(`${c.meal_entries} meal entries`);
  if (c.tasks) parts.push(`${c.tasks} tasks`);
  if (c.habits) parts.push(`${c.habits} habits`);
  if (c.habit_entries) parts.push(`${c.habit_entries} habit entries`);
  if (c.health_logs) parts.push(`${c.health_logs} health logs`);
  if (c.daily_logs) parts.push(`${c.daily_logs} daily logs`);
  if (c.chat_history) parts.push(`${c.chat_history} chat msgs`);
  return parts.length ? parts.join(", ") : "0 items";
}
