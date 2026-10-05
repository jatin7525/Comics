"use client";
import Link from "next/link";
import { useState } from "react";
import type { EditorData } from "./publication-editor";
import { PublicationMedia } from "./publication-media";
import { ChapterReleasePanel } from "./chapter-release";
import { Status } from "./ui";

export function ChapterWorkspace({
  publication,
  chapterId,
}: {
  publication: EditorData;
  chapterId: string;
}) {
  const [draft, setDraft] = useState(publication),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = draft.release?.id === chapterId;
  const chapter = draft.chapters?.find((c) => c.id === chapterId);
  const exists =
    pending || !!chapter || (chapterId === "all" && !draft.chapters?.length);
  async function reload() {
    const response = await fetch(`/api/publications/${draft.id}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message ?? "Could not reload chapter.");
    setDraft(data);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save chapter.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="comic-management">
      <header className="comic-management-header">
        <div>
          <Link
            className="text-link"
            href={`/studio/publications/${draft.id}/edit`}
          >
            ← {draft.title}
          </Link>
          <h1>
            {pending ? "Prepare chapter" : (chapter?.title ?? "Comic pages")}
          </h1>
          <p>
            Upload, preview and edit one page at a time, or add a whole batch.
          </p>
        </div>
        <Status value={pending ? draft.release!.status : draft.status} />
      </header>
      {!exists ? (
        <p className="notice">
          This chapter was discarded or changed. Return to the comic editor.
        </p>
      ) : pending ? (
        <section className="panel">
          <ChapterReleasePanel
            key={draft.release!.id}
            publication={draft}
            busy={busy}
            run={run}
            reload={reload}
            showPages
          />
        </section>
      ) : (
        <section className="panel">
          {draft.status === "published" && (
            <p className="notice">
              This chapter is live. Saved edits appear immediately.
            </p>
          )}
          <PublicationMedia
            publication={draft}
            mode="pages"
            chapterId={chapterId === "all" ? undefined : chapterId}
            onBusy={setBusy}
            onChange={setDraft}
          />
        </section>
      )}
      <p className="form-error" role="alert">
        {error}
      </p>
    </section>
  );
}
