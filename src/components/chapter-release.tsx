"use client";
import { useState } from "react";
import { requestJson } from "./mutation";
import { LocalPreview } from "./publication-media";
import type { EditorData } from "./publication-editor";

const statusText = {
  draft: "Draft · only you can see these pages",
  changes_requested: "Changes requested",
  submitted: "Awaiting editorial review",
} as const;

export function ChapterReleasePanel({
  publication,
  busy,
  run,
  reload,
}: {
  publication: EditorData;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const release = publication.release ?? null;
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [progress, setProgress] = useState("");
  const [title, setTitle] = useState(
    release?.title ?? `Chapter ${(publication.chapters?.length || 1) + 1}`,
  );
  const base = `/api/publications/${publication.id}/release`;
  const pending = (publication.pages ?? []).filter(
    (page) => page.number > publication.pageCount,
  );
  const editable =
    release && ["draft", "changes_requested"].includes(release.status);

  function choose(input: HTMLInputElement) {
    const chosen = Array.from(input.files ?? []);
    input.value = "";
    if (
      chosen.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024,
      )
    )
      throw new Error("Choose JPEG, PNG or WebP images up to 10 MB each.");
    setFiles((current) => [
      ...current,
      ...chosen.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }
  function upload() {
    return run(async () => {
      let version = publication.version,
        completed = 0;
      try {
        for (const item of files) {
          setProgress(`Uploading ${completed + 1} of ${files.length}`);
          const form = new FormData();
          form.set("file", item.file);
          form.set("version", String(version));
          form.set("alt", `Comic page: ${item.file.name}`.slice(0, 1000));
          const response = await fetch(`${base}/upload`, {
            method: "POST",
            body: form,
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              `${item.file.name}: ${data.error?.message ?? "Upload failed"}. ${completed} pages saved; the rest are kept for retry.`,
            );
          version = data.version;
          completed++;
          setFiles((current) => current.filter((file) => file.id !== item.id));
        }
      } finally {
        setProgress("");
        await reload();
      }
    });
  }

  return (
    <section className="chapter-release" aria-labelledby="release-heading">
      <h3 id="release-heading">Add a new chapter</h3>
      {!release ? (
        <>
          <p className="muted">
            Readers keep reading the published chapters while you prepare the
            next one. New pages stay private until the editorial team approves
            them.
          </p>
          <form
            className="release-start"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await requestJson(base, {
                  version: publication.version,
                  title,
                });
                await reload();
              });
            }}
          >
            <label className="field">
              New chapter title
              <input
                value={title}
                maxLength={100}
                required
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy || !title.trim()}>
              Start new chapter
            </button>
          </form>
        </>
      ) : (
        <>
          <p>
            <strong>{release.title}</strong>{" "}
            <span className="tag">{statusText[release.status]}</span>
          </p>
          {release.feedback && release.status === "changes_requested" && (
            <div className="notice">Editorial feedback: {release.feedback}</div>
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
                    "PATCH",
                  );
                  await reload();
                });
              }}
            >
              <label className="field">
                Chapter title
                <input
                  value={title}
                  maxLength={100}
                  required
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={
                  busy || !title.trim() || title.trim() === release.title
                }
              >
                Rename
              </button>
            </form>
          )}
          {!!pending.length && (
            <>
              <h4>
                New chapter pages · {pending.length} (will be pages{" "}
                {publication.pageCount + 1}–
                {publication.pageCount + pending.length})
              </h4>
              <div className="comic-filmstrip" aria-label="New chapter pages">
                {pending.map((page) => (
                  <figure key={page.id}>
                    <img
                      loading="lazy"
                      src={`/api/studio/${publication.id}/media/${page.number}?v=${publication.version}`}
                      alt={page.alt}
                    />
                    <figcaption>
                      Page {page.number - publication.pageCount} of the chapter
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {editable && (
            <>
              <label className="field">
                Add pages to this chapter (in reading order)
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void run(async () => choose(input));
                  }}
                />
              </label>
              {!!files.length && (
                <div className="comic-filmstrip" aria-label="Selected pages">
                  {files.map((item, index) => (
                    <figure key={item.id}>
                      <LocalPreview file={item.file} />
                      <figcaption>
                        New page {pending.length + index + 1} · {item.file.name}
                      </figcaption>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((file) => file.id !== item.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              <div className="sample-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !files.length}
                  onClick={() => void upload()}
                >
                  {busy && progress
                    ? progress
                    : `Upload pages${files.length ? ` (${files.length})` : ""}`}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !pending.length || !!files.length}
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
              </div>
            </>
          )}
          {release.status === "submitted" && (
            <div className="notice" role="status">
              Submitted. Readers will see this chapter once it is approved.
            </div>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  "Discard this chapter and delete its uploaded pages? This cannot be undone.",
                )
              )
                return;
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
      <p role="status">{progress}</p>
    </section>
  );
}
