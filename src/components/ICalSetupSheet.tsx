import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteSetting, setSetting } from "../db";
import { ICAL_URL_SETTING, invalidateICalCache } from "../lib/ical";

const TRANSITION_MS = 280;

interface Props {
  onClose: () => void;
}

// Bottom sheet for setting up (or clearing) the Google Calendar iCal
// URL — the OAuth-free way of reading the calendar. Solves the "iOS
// keeps signing me out" problem by trading real-time freshness for a
// URL that never expires.
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

  const existingSetting = useLiveQuery(() =>
    db.settings.get(ICAL_URL_SETTING),
  );
  const existingUrl = (existingSetting?.value as string | undefined) ?? "";

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(!existingUrl);

  // Hydrate the draft once we know if a URL is already saved.
  useEffect(() => {
    if (existingSetting !== undefined) {
      setDraft(existingUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSetting !== undefined]);

  const looksLikeGoogleICal = (url: string): boolean => {
    return /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/]+\/(?:private-[a-z0-9]+|public)\/(?:basic|full)\.ics$/i.test(
      url.trim(),
    );
  };

  const onSave = async () => {
    const v = draft.trim();
    if (!v) {
      setError("Paste your iCal URL first.");
      return;
    }
    if (!looksLikeGoogleICal(v)) {
      setError(
        "That doesn't look like a Google Calendar iCal URL. Copy it from Calendar settings (see below).",
      );
      return;
    }
    setError(null);
    setSaving(true);
    await setSetting(ICAL_URL_SETTING, v);
    invalidateICalCache();
    setSaving(false);
    close();
  };

  const onClear = async () => {
    if (!existingUrl) return;
    if (!confirm("Remove the iCal URL? Calendar will need to fall back to Google sign-in.")) return;
    await deleteSetting(ICAL_URL_SETTING);
    invalidateICalCache();
    setDraft("");
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
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[90%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
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
            Calendar
          </span>
          <span className="w-12" />
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-8 [&::-webkit-scrollbar]:hidden">
          <p className="mb-3 text-sm leading-relaxed text-fg">
            Read your calendar without signing in. Google gives every
            calendar a private iCal URL that lets any app fetch its
            events — no login required, no expiration.
          </p>
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Tradeoffs: read-only (can't create events from the app),
            events lag by up to about an hour behind Google's live
            state. The URL is a bearer token — anyone with it can read
            this calendar, so treat it like a password. If it ever
            leaks, rotate it by clicking "Reset" next to the URL on
            Google's side.
          </p>

          {/* Input + save row */}
          <label className="block">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
              Secret iCal URL
            </span>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              rows={3}
              className="block w-full min-w-0 resize-none rounded-[8px] border border-border bg-surface px-2.5 py-2 font-mono text-[12px] outline-none placeholder:text-subtle"
            />
          </label>

          {error && (
            <div className="mt-2 rounded-[8px] border border-accent bg-surface px-3 py-2 text-[12px] text-accent-fg">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-medium transition ${
                saving
                  ? "bg-surface-2 text-subtle"
                  : "bg-accent text-[#0a160d]"
              }`}
            >
              {saving ? "Saving…" : existingUrl ? "Update" : "Save"}
            </button>
            {existingUrl && (
              <button
                onClick={onClear}
                className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-fg"
              >
                Remove
              </button>
            )}
          </div>

          {/* Instructions — collapsed after setup so the sheet stays tidy on
              returns. */}
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
                <span className="font-medium">Open Google Calendar on desktop</span>
                {" — "}
                <span className="text-muted">
                  calendar.google.com (the setting lives in the web UI,
                  not the mobile app).
                </span>
              </li>
              <li>
                <span className="font-medium">
                  Hover the calendar name on the left → "⋮" → Settings and
                  sharing
                </span>
                {"."}
              </li>
              <li>
                <span className="font-medium">
                  Scroll to "Integrate calendar" → find "Secret address in
                  iCal format"
                </span>
                {"."}
              </li>
              <li>
                <span className="font-medium">
                  Copy the URL (ends with .ics)
                </span>
                {" and paste it above."}
              </li>
              <li className="text-muted">
                If it ever leaks, click "Reset" next to that URL on
                Google's side; the old one dies immediately.
              </li>
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
