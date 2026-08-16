import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import type { Note } from "../db/types";
import NoteEditorSheet, {
  type NoteTarget,
} from "../components/NoteEditorSheet";

export default function Notes() {
  const notes =
    useLiveQuery(() =>
      db.notes.orderBy("updatedAt").reverse().toArray(),
    ) ?? [];

  const [target, setTarget] = useState<NoteTarget | null>(null);

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Notes
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </div>
        </header>

        <button
          onClick={() => setTarget("new")}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
        >
          + New note
        </button>

        {notes.length === 0 ? (
          <div className="mt-2 rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No notes yet. Tap "+ New note" to start one.
          </div>
        ) : (
          <Section title="All notes" meta={`${notes.length}`}>
            <Card>
              {notes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  onOpen={() => setTarget(n.id!)}
                />
              ))}
            </Card>
          </Section>
        )}
      </div>

      {target !== null && (
        <NoteEditorSheet target={target} onClose={() => setTarget(null)} />
      )}
    </div>
  );
}

function NoteRow({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const title = note.title.trim() || "Untitled";
  const previewLine =
    note.body.trim().split("\n").find((l) => l.trim() !== "") ?? "";
  const preview = previewLine.length > 0 ? previewLine : "No additional text";

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 border-t border-border px-3.5 py-3 text-left first:border-t-0 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-base leading-tight text-fg">{title}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {preview}
        </div>
      </div>
      <div className="flex-shrink-0 font-mono text-[11px] text-subtle">
        {relativeTime(note.updatedAt)}
      </div>
    </button>
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
