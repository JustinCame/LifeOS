import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import type { Note } from "../db/types";
import { DAILY_TAGS, tagByKey } from "../lib/dailyLog";
import NoteEditorSheet, {
  type NoteTarget,
} from "../components/NoteEditorSheet";

type SortKey = "updated" | "created" | "alpha";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Recent",
  created: "Created",
  alpha: "A-Z",
};

// Cycle order for the sort pill — one tap advances to the next.
const SORT_ORDER: SortKey[] = ["updated", "created", "alpha"];

export default function Notes() {
  const notes =
    useLiveQuery(() =>
      db.notes.orderBy("updatedAt").reverse().toArray(),
    ) ?? [];

  const [target, setTarget] = useState<NoteTarget | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);

  // Split active vs archived up front.
  const active = notes.filter((n) => n.archivedAt === undefined);
  const archived = notes.filter((n) => n.archivedAt !== undefined);

  // Apply filters (search + tags) and sort. Search matches title OR body
  // substring, case-insensitive. Tags AND together (a note must have ALL
  // selected tags to match) — matches how you'd expect chip filters to
  // narrow.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = active.filter((n) => {
      if (q) {
        const hay =
          n.title.toLowerCase() + "\n" + n.body.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeTags.length > 0) {
        const noteTags = new Set(n.tags ?? []);
        for (const t of activeTags) if (!noteTags.has(t)) return false;
      }
      return true;
    });
    return sortNotes(filtered, sort);
  }, [active, query, activeTags, sort]);

  const pinned = filtered.filter((n) => n.pinnedAt !== undefined);
  const unpinned = filtered.filter((n) => n.pinnedAt === undefined);

  const cycleSort = () => {
    const i = SORT_ORDER.indexOf(sort);
    setSort(SORT_ORDER[(i + 1) % SORT_ORDER.length]);
  };

  const toggleTag = (key: string) => {
    setActiveTags((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  };

  const clearFilters = () => {
    setQuery("");
    setActiveTags([]);
  };

  const anyFilter = query.trim().length > 0 || activeTags.length > 0;
  const meta = anyFilter
    ? `${filtered.length} of ${active.length}`
    : `${active.length}`;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Notes
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {meta} {active.length === 1 && !anyFilter ? "note" : "notes"}
          </div>
        </header>

        <button
          onClick={() => setTarget("new")}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
        >
          + New note
        </button>

        {/* Search input — filters live as you type. Matches title or body. */}
        <div className="relative mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or body"
            className="w-full rounded-[12px] border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none placeholder:text-subtle focus:border-border-strong"
          />
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 text-subtle" />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Filter row: sort pill on the left, tag chips scrolling right. */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <button
            onClick={cycleSort}
            className="flex-shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg hover:border-border-strong"
          >
            ↓ {SORT_LABEL[sort]}
          </button>
          {DAILY_TAGS.map((t) => {
            const active = activeTags.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTag(t.key)}
                className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition"
                style={{
                  background: active ? t.color : "var(--color-surface)",
                  color: active ? "#fff" : "var(--color-fg)",
                  boxShadow: active
                    ? "none"
                    : `inset 0 0 0 1px ${t.color}55`,
                }}
              >
                {t.label}
              </button>
            );
          })}
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="flex-shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-subtle hover:text-fg"
            >
              Clear
            </button>
          )}
        </div>

        {/* Empty states */}
        {active.length === 0 ? (
          <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No notes yet. Tap "+ New note" to start one.
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No notes match your search.
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section title="Pinned" meta={`${pinned.length}`}>
                <Card>
                  {pinned.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      onOpen={() => setTarget(n.id!)}
                    />
                  ))}
                </Card>
              </Section>
            )}

            {unpinned.length > 0 && (
              <Section
                title={pinned.length > 0 ? "All notes" : "Notes"}
                meta={`${unpinned.length}`}
              >
                <Card>
                  {unpinned.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      onOpen={() => setTarget(n.id!)}
                    />
                  ))}
                </Card>
              </Section>
            )}
          </>
        )}

        {/* Archived (soft-deleted) notes at the bottom. Collapsed by
            default so the main list stays focused; expand to restore or
            permanently delete. */}
        {archived.length > 0 && (
          <Section title={`Archived · ${archived.length}`}>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center justify-between rounded-[16px] border border-border bg-surface px-3.5 py-2.5 text-left text-sm text-muted hover:border-border-strong"
            >
              <span>
                {showArchived ? "Hide archived" : "Show archived"}
              </span>
              <span className="font-mono text-[11px] text-subtle">
                {archived.length}
              </span>
            </button>
            {showArchived && (
              <Card>
                {sortNotes(archived, sort).map((n) => (
                  <ArchivedNoteRow
                    key={n.id}
                    note={n}
                    onOpen={() => setTarget(n.id!)}
                  />
                ))}
              </Card>
            )}
          </Section>
        )}
      </div>

      {target !== null && (
        <NoteEditorSheet target={target} onClose={() => setTarget(null)} />
      )}
    </div>
  );
}

// Client-side sort helpers. All three fall back to updatedAt as a
// tiebreaker so ordering stays stable when the primary key ties.
function sortNotes(list: Note[], sort: SortKey): Note[] {
  const copy = [...list];
  if (sort === "updated") {
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
  } else if (sort === "created") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    copy.sort((a, b) => {
      const at = (a.title || "Untitled").toLowerCase();
      const bt = (b.title || "Untitled").toLowerCase();
      if (at === bt) return b.updatedAt - a.updatedAt;
      return at.localeCompare(bt);
    });
  }
  return copy;
}

function NoteRow({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const title = note.title.trim() || "Untitled";
  const previewLine =
    note.body.trim().split("\n").find((l) => l.trim() !== "") ?? "";
  const preview = previewLine.length > 0 ? previewLine : "No additional text";
  const tags = (note.tags ?? [])
    .map((k) => tagByKey(k))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 border-t border-border px-3.5 py-3 text-left first:border-t-0 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {note.pinnedAt !== undefined && (
            <PinIcon className="flex-shrink-0 text-accent-fg" />
          )}
          <div className="truncate text-base leading-tight text-fg">
            {title}
          </div>
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {preview}
        </div>
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <span
                key={t.key}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: `${t.color}22`,
                  color: t.color,
                }}
              >
                {t.label}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="font-mono text-[10px] text-subtle">
                +{tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 font-mono text-[11px] text-subtle">
        {relativeTime(note.updatedAt)}
      </div>
    </button>
  );
}

function ArchivedNoteRow({
  note,
  onOpen,
}: {
  note: Note;
  onOpen: () => void;
}) {
  const title = note.title.trim() || "Untitled";
  const preview = note.body.trim().split("\n").find((l) => l.trim() !== "")
    ?.slice(0, 60) ?? "";

  const onRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.id === undefined) return;
    await db.notes.update(note.id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
  };
  const onDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.id === undefined) return;
    if (!confirm(`Permanently delete "${title}"? This can't be undone.`)) {
      return;
    }
    await db.notes.delete(note.id);
  };

  return (
    <div className="flex items-start gap-2 border-t border-border px-3.5 py-3 text-left first:border-t-0">
      <button
        onClick={onOpen}
        className="min-w-0 flex-1 text-left opacity-60"
      >
        <div className="truncate text-sm leading-tight text-fg">{title}</div>
        {preview && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
            {preview}
          </div>
        )}
      </button>
      <button
        onClick={onRestore}
        className="flex-shrink-0 rounded-[8px] border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.04em] text-subtle hover:text-fg"
      >
        Restore
      </button>
      <button
        onClick={onDelete}
        className="flex-shrink-0 rounded-[8px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.04em] text-muted hover:text-fg"
      >
        Delete
      </button>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
      <circle
        cx="7"
        cy="7"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 13.5 L10.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path
        d="M2 2l7 7M9 2l-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
    >
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
