import { useEffect, useState } from "react";
import { db } from "../db";
import type { Note } from "../db/types";
import { DAILY_TAGS } from "../lib/dailyLog";

export type NoteTarget = number | "new";

interface Props {
  // Parent only mounts when actually editing — no "closed" state inside.
  target: NoteTarget;
  onClose: () => void;
}

const AUTOSAVE_MS = 400;
const TRANSITION_MS = 280;

export default function NoteEditorSheet({ target, onClose }: Props) {
  const isCreating = target === "new";
  const existingId = typeof target === "number" ? target : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinnedAt, setPinnedAt] = useState<number | undefined>(undefined);
  const [archivedAt, setArchivedAt] = useState<number | undefined>(undefined);
  // For new notes, holds the id Dexie assigned after the first save so
  // subsequent edits update the same row.
  const [draftId, setDraftId] = useState<number | null>(null);

  // Slide-in animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Load the note on mount (only fires once since target is fixed).
  useEffect(() => {
    if (target === "new") {
      setTitle("");
      setBody("");
      setTags([]);
      setPinnedAt(undefined);
      setArchivedAt(undefined);
      setDraftId(null);
      return;
    }
    if (typeof target === "number") {
      let cancelled = false;
      db.notes.get(target).then((n) => {
        if (cancelled || !n) return;
        setTitle(n.title);
        setBody(n.body);
        setTags(n.tags ?? []);
        setPinnedAt(n.pinnedAt);
        setArchivedAt(n.archivedAt);
        setDraftId(null);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [target]);

  // Debounced auto-save. Persists title/body/tags on any change; pin +
  // archive toggles below use immediate writes since they're one-tap
  // actions the user expects to stick right away.
  useEffect(() => {
    const persistedId = existingId ?? draftId;
    const hasContent =
      title.trim().length > 0 || body.trim().length > 0 || tags.length > 0;

    // Don't create a new row for an empty new note.
    if (persistedId === null && !hasContent) return;

    const handle = window.setTimeout(async () => {
      const now = Date.now();
      if (persistedId === null) {
        const id = await db.notes.add({
          title,
          body,
          tags: tags.length > 0 ? tags : undefined,
          createdAt: now,
          updatedAt: now,
        });
        setDraftId(id as number);
      } else {
        await db.notes.update(persistedId, {
          title,
          body,
          tags: tags.length > 0 ? tags : undefined,
          updatedAt: now,
        });
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(handle);
  }, [title, body, tags, existingId, draftId]);

  const flushAndClose = () => {
    const persistedId = existingId ?? draftId;
    const hasContent =
      title.trim().length > 0 || body.trim().length > 0 || tags.length > 0;
    // If the user closed before the debounce fired, save now.
    if (persistedId !== null) {
      void db.notes.update(persistedId, {
        title,
        body,
        tags: tags.length > 0 ? tags : undefined,
        updatedAt: Date.now(),
      });
    } else if (hasContent) {
      const now = Date.now();
      void db.notes.add({
        title,
        body,
        tags: tags.length > 0 ? tags : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  // Pin toggle. Writes immediately — one-tap action shouldn't wait on
  // debounce, and there's no draft concept for pin state (an unsaved
  // note can't be pinned since there's nothing persisted to reference).
  const togglePin = async () => {
    const persistedId = existingId ?? draftId;
    const next = pinnedAt === undefined ? Date.now() : undefined;
    setPinnedAt(next);
    if (persistedId !== null) {
      await db.notes.update(persistedId, {
        pinnedAt: next,
        updatedAt: Date.now(),
      } as Partial<Note>);
    }
  };

  // Archive (soft delete) → sets archivedAt. Restore clears it. Both
  // close the sheet after so the user's back at the list.
  const onArchive = async () => {
    const persistedId = existingId ?? draftId;
    if (persistedId === null) {
      // Never persisted — same as discarding.
      setShown(false);
      window.setTimeout(onClose, TRANSITION_MS);
      return;
    }
    if (!confirm("Archive this note? You can restore it later.")) return;
    await db.notes.update(persistedId, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const onRestore = async () => {
    const persistedId = existingId ?? draftId;
    if (persistedId === null) return;
    await db.notes.update(persistedId, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    setArchivedAt(undefined);
  };

  const onDeletePermanent = async () => {
    const persistedId = existingId ?? draftId;
    if (persistedId === null) return;
    if (
      !confirm(
        "Permanently delete this note? This can't be undone.",
      )
    ) {
      return;
    }
    await db.notes.delete(persistedId);
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const toggleTag = (key: string) => {
    setTags((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  };

  const isPersisted = existingId !== null || draftId !== null;
  const isArchived = archivedAt !== undefined;

  return (
    <>
      <div
        onClick={flushAndClose}
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
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={flushAndClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
          <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {isCreating && draftId === null
              ? "New note"
              : isArchived
                ? "Archived"
                : "Note"}
          </span>
          <div className="flex items-center gap-1">
            {/* Pin toggle — only meaningful for persisted notes. */}
            {isPersisted && !isArchived && (
              <button
                onClick={togglePin}
                aria-label={pinnedAt ? "Unpin note" : "Pin note"}
                className={`grid h-8 w-8 place-items-center rounded-[8px] ${
                  pinnedAt !== undefined
                    ? "bg-accent-soft text-accent-fg"
                    : "text-subtle hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <PinIcon />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-xl font-medium text-fg outline-none placeholder:text-subtle"
            readOnly={isArchived}
          />

          {/* Tag chips — same 12-tag palette daily_logs uses so a "Work"
              tag reads the same across surfaces. */}
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {DAILY_TAGS.map((t) => {
              const active = tags.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => toggleTag(t.key)}
                  disabled={isArchived}
                  className="rounded-[8px] py-1.5 text-center text-[11px] font-medium transition disabled:opacity-40"
                  style={{
                    background: active ? t.color : "var(--color-surface-2)",
                    color: active ? "#fff" : "var(--color-fg)",
                    boxShadow: active ? "none" : `inset 0 0 0 1px ${t.color}55`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start typing…"
            className="mt-4 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-fg outline-none placeholder:text-subtle"
            style={{ minHeight: "48vh" }}
            readOnly={isArchived}
          />

          {/* Bottom actions — Archive / Restore + permanent Delete for
              archived notes. */}
          {isPersisted && (
            <div className="mt-4 flex items-center gap-2">
              {isArchived ? (
                <>
                  <button
                    onClick={onRestore}
                    className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-fg hover:border-border-strong"
                  >
                    Restore
                  </button>
                  <button
                    onClick={onDeletePermanent}
                    className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-fg"
                  >
                    Delete permanently
                  </button>
                </>
              ) : (
                <button
                  onClick={onArchive}
                  className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-fg"
                >
                  Archive
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
      <path
        d="M4 1h4v3l2 2v1.5H7v3l-1 1-1-1v-3H2V6l2-2V1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
    </svg>
  );
}
