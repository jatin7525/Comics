"use client";
import Link from "next/link";
import { useState } from "react";
import { requestJson } from "./mutation";
import { PublicationMedia } from "./publication-media";
import type { EditorData } from "./publication-editor";

export function ChapterReleasePanel({
  publication,
  busy,
  run,
  reload,
  showPages = false,
}: {
  publication: EditorData;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
  showPages?: boolean;
}) {
  const release = publication.release;
  const [title, setTitle] = useState(
    release?.title ?? `Chapter ${(publication.chapters?.length || 1) + 1}`,
  );
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaDirty, setMediaDirty] = useState(false);
  const locked = busy || mediaBusy;
  const editable =
    !release || ["draft", "changes_requested"].includes(release.status);
  const base = `/api/publications/${publication.id}/release`;
  return (
    <section className="chapter-release">
      <h2>{release ? release.title : "Start a new chapter"}</h2>
      <p>
        Readers keep access to published chapters while you prepare the next
        one. New pages stay private until editorial approval.
      </p>
      {release && (
        <p className="tag">
          {release.status.replaceAll("_", " ")} · {release.pageCount} pages
        </p>
      )}
      {release?.feedback && (
        <p className="notice">Editorial feedback: {release.feedback}</p>
      )}
      {editable && (
        <form
          className="release-start"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await requestJson(
                base,
                { version: publication.version, title },
                release ? "PATCH" : "POST",
              );
              await reload();
            });
          }}
        >
          <label className="field">
            Chapter title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={100}
              disabled={locked}
            />
          </label>
          <button
            className="secondary"
            disabled={
              locked || !title.trim() || title.trim() === release?.title
            }
          >
            {release ? "Save chapter title" : "Create chapter"}
          </button>
        </form>
      )}
      {release && (
        <>
          {!showPages && (
            <Link
              className="primary"
              href={`/studio/publications/${publication.id}/chapters/${release.id}`}
            >
              Open chapter editor
            </Link>
          )}
          {showPages && (
            <PublicationMedia
              publication={publication}
              mode="release"
              onBusy={setMediaBusy}
              onChange={reload}
              onDirty={setMediaDirty}
            />
          )}
          {editable ? (
            <button
              className="primary"
              disabled={locked || mediaDirty || !release.pageCount}
              onClick={() =>
                void run(async () => {
                  await requestJson(`${base}/submit`, {
                    version: publication.version,
                  });
                  await reload();
                })
              }
            >
              Submit chapter for review
            </button>
          ) : (
            <p className="notice">
              Awaiting editorial review. Pages are locked until changes are
              requested or the chapter is approved.
            </p>
          )}
          <button
            className="secondary"
            disabled={locked}
            onClick={() => {
              if (
                window.confirm(
                  "Discard this chapter and permanently delete its uploaded pages?",
                )
              )
                void run(async () => {
                  await requestJson(
                    base,
                    { version: publication.version },
                    "DELETE",
                  );
                  await reload();
                });
            }}
          >
            Discard chapter
          </button>
        </>
      )}
    </section>
  );
}
