"use client";
import { useState } from "react";
import { MAX_CHAPTERS, validChapters } from "@/domain/chapters";
import type { EditorData } from "./publication-editor";

type Row = { key: string; id?: string; title: string; startPage: number };
export type ChapterDraft = { id?: string; title: string; startPage: number };

export function ChapterEditor({
  publication,
  busy,
  editable,
  onSave,
  onDelete,
}: {
  publication: EditorData;
  busy: boolean;
  editable: boolean;
  onSave: (chapters: ChapterDraft[]) => Promise<void>;
  // Permanently deletes a saved chapter and its pages; omitted when page changes are paused.
  onDelete?: (chapterId: string) => Promise<void>;
}) {
  const pageCount = publication.pageCount;
  const [rows, setRows] = useState<Row[]>(() =>
    (publication.chapters ?? []).map((chapter) => ({
      ...chapter,
      key: chapter.id,
    })),
  );
  const saved = JSON.stringify(
    (publication.chapters ?? []).map(({ title, startPage }) => [
      title,
      startPage,
    ]),
  );
  const changed =
    JSON.stringify(rows.map(({ title, startPage }) => [title, startPage])) !==
    saved;
  const valid =
    validChapters(
      rows.map((row) => ({ id: row.key, startPage: row.startPage })),
      pageCount,
    ) && rows.every((row) => row.title.trim());
  const last = rows.at(-1);
  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  function save(next: Row[]) {
    return onSave(
      next.map(({ id, title, startPage }) => ({
        ...(id ? { id } : {}),
        title: title.trim(),
        startPage,
      })),
    );
  }
  return (
    <section className="chapter-editor" aria-labelledby="chapter-heading">
      <h3 id="chapter-heading">Chapters</h3>
      {!rows.length ? (
        <>
          <p className="muted">
            This comic reads as one continuous story. Split it into chapters to
            give readers named sections they can jump between.
          </p>
          {editable && (
            <button
              type="button"
              className="secondary"
              disabled={busy || pageCount < 1}
              onClick={() =>
                setRows([
                  {
                    key: crypto.randomUUID(),
                    title: "Chapter 1",
                    startPage: 1,
                  },
                ])
              }
            >
              Split into chapters
            </button>
          )}
          {pageCount < 1 && (
            <p className="muted">Upload pages before adding chapters.</p>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            Each chapter starts at a page and runs until the next chapter
            begins. Reordering pages keeps chapter starts at the same page
            numbers. “Remove” merges a chapter into the previous one; “Delete
            chapter and pages” erases its pages permanently.
          </p>
          <ol className="chapter-rows">
            {rows.map((row, index) => {
              const end = (rows[index + 1]?.startPage ?? pageCount + 1) - 1;
              const min =
                index === 0 ? 1 : (rows[index - 1]?.startPage ?? 0) + 1;
              return (
                <li key={row.key}>
                  <label className="field">
                    Chapter {index + 1} title
                    <input
                      value={row.title}
                      maxLength={100}
                      required
                      disabled={busy || !editable}
                      onChange={(e) => update(index, { title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Starts on page
                    <input
                      type="number"
                      min={min}
                      max={pageCount}
                      value={row.startPage}
                      disabled={busy || !editable || index === 0}
                      onChange={(e) =>
                        update(index, {
                          startPage: Math.trunc(Number(e.target.value)) || 1,
                        })
                      }
                    />
                  </label>
                  <span className="muted chapter-range">
                    {end >= row.startPage
                      ? row.startPage === end
                        ? `Page ${end}`
                        : `Pages ${row.startPage}–${end}`
                      : "Overlaps the next chapter"}
                  </span>
                  {editable && index > 0 && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`Remove chapter ${index + 1}; its pages join the previous chapter`}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                  {editable &&
                    onDelete &&
                    row.id &&
                    (publication.chapters?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        aria-label={`Delete chapter ${index + 1} and its pages`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently delete "${row.title}" and all of its pages? This cannot be undone.`,
                            )
                          )
                            void onDelete(row.id!);
                        }}
                      >
                        Delete chapter and pages
                      </button>
                    )}
                </li>
              );
            })}
          </ol>
          {editable && (
            <div className="sample-actions">
              <button
                type="button"
                className="secondary"
                disabled={
                  busy ||
                  !last ||
                  last.startPage >= pageCount ||
                  rows.length >= MAX_CHAPTERS
                }
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    {
                      key: crypto.randomUUID(),
                      title: `Chapter ${current.length + 1}`,
                      startPage: Math.min(pageCount, last!.startPage + 1),
                    },
                  ])
                }
              >
                Add chapter
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !changed || !valid}
                onClick={() => void save(rows)}
              >
                Save chapters
              </button>
              {!!publication.chapters?.length && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void save([])}
                >
                  Remove all chapters
                </button>
              )}
            </div>
          )}
          {!valid && (
            <p className="form-error">
              Chapter 1 starts on page 1. Every later chapter needs a title and
              must start after the previous chapter, on a saved page.
            </p>
          )}
        </>
      )}
    </section>
  );
}
