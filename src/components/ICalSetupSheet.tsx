import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../db";
import {
  ICAL_URLS_SETTING,
  MAX_ICAL_SOURCES,
  clearLegacyICalSetting,
  getICalSources,
  invalidateICalCache,
  normalizeToICalUrl,
  type ICalSource,
} from "../lib/ical";

const TRANSITION_MS = 280;

interface Props {
  onClose: () => void;
}

// Bottom sheet for adding, editing, and removing iCal calendar URLs.
// Supports up to MAX_ICAL_SOURCES calendars — Justin uses a personal
// one, a college schedule (SUNY), and a US holiday feed, and wanted
// room for more. Each row is an optional label + a URL.
export default function ICalSetupSheet({ onClose }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  // Draft rows in local state — auto-hydrated from Dexie once on mount.
  // React key is a synthetic local id so removing / adding rows doesn't
  // cause input focus to jump around during edits.
  const [rows, setRows] = useState<
    Array<{ id: number; label: string; url: string }>
  >([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  // Nudge the sheet to reload state whenever the stored setting changes
  // (e.g. someone else's tab wrote to it). Simple useLiveQuery, ignored
  // once hydrated so it doesn't clobber mid-edit state.
  useLiveQuery(() => db.settings.get(ICAL_URLS_SETTING));

  useEffect(() => {
    if (hydrated) return;
    getICalSources().then((sources) => {
      const seeded =
        sources.length > 0
          ? sources.map((s, i) => ({
              id: i,
              label: s.label ?? "",
              url: s.url,
            }))
          : [{ id: 0, label: "", url: "" }];
      setRows(seeded);
      // Instructions expanded only if we have no configured URLs yet.
      setInstructionsOpen(sources.length === 0);
      setHydrated(true);
    });
  }, [hydrated]);

  const updateRow = (id: number, patch: Partial<{ label: string; url: string }>) => {
    setRows((cur) =>
      cur.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setError(null);
  };

  const addRow = () => {
    if (rows.length >= MAX_ICAL_SOURCES) return;
    setRows((cur) => [
      ...cur,
      { id: Date.now(), label: "", url: "" },
    ]);
    setError(null);
  };

  const removeRow = (id: number) => {
    setRows((cur) => cur.filter((r) => r.id !== id));
    setError(null);
  };

  const onSave = async () => {
    // Drop entirely empty rows silently — a user can add an extra row
    // and never fill it in without triggering a validation error.
    const nonEmpty = rows.filter(
      (r) => r.url.trim().length > 0 || r.label.trim().length > 0,
    );

    // Validate + normalize each row's input. Users can paste the .ics
    // URL, the public web URL, an <iframe> embed code, a webcal://
    // link, or a bare calendar id — normalizeToICalUrl rewrites all of
    // them into the canonical .ics form that our server allowlist
    // accepts. If any row can't be parsed, bail early with a specific
    // error naming which one.
    const normalized: ICalSource[] = [];
    for (const r of nonEmpty) {
      const url = r.url.trim();
      if (!url) {
        setError(
          r.label
            ? `The "${r.label}" row needs a URL or should be removed.`
            : "One of your rows has a label but no URL.",
        );
        return;
      }
      const canonical = normalizeToICalUrl(url);
      if (!canonical) {
        setError(
          r.label
            ? `"${r.label}" doesn't look like a Google Calendar URL. Try the .ics URL, the public share URL, an embed code, or the calendar's id.`
            : "One of your URLs isn't a recognizable Google Calendar link. Try the .ics URL, the public share URL, an embed code, or the calendar's id.",
        );
        return;
      }
      normalized.push({
        url: canonical,
        label: r.label.trim() || undefined,
      });
    }

    setError(null);
    setSaving(true);
    const payload = normalized;
    await setSetting(ICAL_URLS_SETTING, payload);
    // Best-effort cleanup of the legacy single-URL setting so we don't
    // have two potentially-conflicting sources of truth on device.
    await clearLegacyICalSetting();
    invalidateICalCache();
    setSaving(false);
    close();
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
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)",
        }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Calendars
          </span>
          <span className="w-12 text-right font-mono text-[11px] text-subtle">
            {rows.filter((r) => r.url.trim()).length}/{MAX_ICAL_SOURCES}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-8 [&::-webkit-scrollbar]:hidden">
          <p className="mb-3 text-sm leading-relaxed text-fg">
            Add up to {MAX_ICAL_SOURCES} Google Calendar feeds —
            personal, school, holidays, whatever. No sign-in, no expiry.
            Labels are optional and show up as a prefix on events so you
            can tell them apart.
          </p>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Paste anything Google gives you for the calendar: the{" "}
            <span className="font-mono text-fg">.ics</span> URL, a public
            share URL, an embed code, a{" "}
            <span className="font-mono text-fg">webcal://</span> link, or
            just the calendar's id (looks like an email). We normalize it
            server-side.
          </p>

          {/* Row list */}
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={row.id}
                className="rounded-[14px] border border-border bg-surface p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    Calendar {i + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(row.id)}
                      className="rounded-[6px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  value={row.label}
                  onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  placeholder="Label (optional) — e.g. Personal"
                  className="mb-2 block w-full min-w-0 rounded-[8px] border border-border bg-bg px-2.5 py-2 text-sm outline-none placeholder:text-subtle"
                />
                <textarea
                  value={row.url}
                  onChange={(e) => updateRow(row.id, { url: e.target.value })}
                  placeholder=".ics URL, embed code, share link, or calendar id"
                  rows={3}
                  className="block w-full min-w-0 resize-none rounded-[8px] border border-border bg-bg px-2.5 py-2 font-mono text-[12px] outline-none placeholder:text-subtle"
                />
              </div>
            ))}
          </div>

          {rows.length < MAX_ICAL_SOURCES && (
            <button
              onClick={addRow}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-subtle hover:border-border-strong hover:text-fg"
            >
              + Add another calendar
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-[8px] border border-accent bg-surface px-3 py-2 text-[12px] text-accent-fg">
              {error}
            </div>
          )}

          <button
            onClick={onSave}
            disabled={saving}
            className={`mt-4 w-full rounded-[10px] px-3 py-2.5 text-sm font-medium transition ${
              saving
                ? "bg-surface-2 text-subtle"
                : "bg-accent text-[#0a160d]"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          {/* Instructions — collapsible. Auto-open only on first setup. */}
          <button
            onClick={() => setInstructionsOpen((v) => !v)}
            className="mt-6 flex w-full items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-left text-sm text-fg hover:border-border-strong"
          >
            <span>How to find your iCal URL</span>
            <span
              className={`text-subtle transition-transform ${
                instructionsOpen ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>
          {instructionsOpen && (
            <ol className="mt-3 space-y-2 rounded-[12px] border border-border bg-surface p-3.5 text-[13px] leading-relaxed text-fg">
              <li>
                <span className="font-medium">
                  Open Google Calendar on desktop
                </span>
                {" — "}
                <span className="text-muted">
                  calendar.google.com. The URL settings aren't in the
                  mobile Calendar app.
                </span>
              </li>
              <li>
                Hover the calendar name on the left → "⋮" →{" "}
                <span className="font-medium">Settings and sharing</span>.
              </li>
              <li>
                For a{" "}
                <span className="font-medium">calendar you own</span>:
                scroll to{" "}
                <span className="font-medium">Integrate calendar</span>{" "}
                and copy either "Secret address in iCal format" (private)
                or "Public address in iCal format" (public).
              </li>
              <li>
                For a{" "}
                <span className="font-medium">
                  subscribed calendar (SUNY, holidays, etc.)
                </span>{" "}
                you don't see an iCal URL for: copy the{" "}
                <span className="font-medium">Public URL to this calendar</span>{" "}
                or the whole <span className="font-mono">&lt;iframe…&gt;</span>{" "}
                embed code from "Integrate calendar". Paste it above and
                we'll convert it.
              </li>
              <li className="text-muted">
                Repeat per calendar. If a secret URL ever leaks, click
                "Reset" next to it in Google Calendar — the old one dies
                immediately.
              </li>
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
