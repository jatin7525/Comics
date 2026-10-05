"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "./mutation";
import type { EditorData } from "./publication-editor";
import { ChapterEditor, type ChapterDraft } from "./chapter-editor";
import { ChapterReleasePanel } from "./chapter-release";

export function LocalPreview({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={ref} alt={file.name} />;
}
export function PublicationMedia({
  publication,
  onChange,
  onBusy,
  mode = "create",
  chapterId,
  onDirty,
}: {
  publication: EditorData;
  onChange: (value: EditorData) => void | Promise<void>;
  onBusy: (value: boolean) => void;
  mode?: "create" | "pages" | "cover" | "release";
  chapterId?: string;
  onDirty?: (value: boolean) => void;
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [textDirty, setTextDirty] = useState(false);
  const dirty = textDirty || files.length > 0 || !!cover;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [selected, setSelected] = useState<string | null>(null);
  // null keeps new pages in the current last chapter; a string starts a new chapter with them.
  const [newChapter, setNewChapter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const isRelease = mode === "release";
  // Pages beyond pageCount belong to an unreleased chapter and are managed in the release panel.
  const allPages = (publication.pages ?? []).filter((page) =>
    isRelease
      ? page.number > publication.pageCount
      : page.number <= publication.pageCount,
  );
  const chapterIndex = (publication.chapters ?? []).findIndex(
    (c) => c.id === chapterId,
  );
  const from =
    chapterIndex >= 0 ? publication.chapters![chapterIndex]!.startPage : 1;
  const to =
    chapterIndex >= 0
      ? (publication.chapters![chapterIndex + 1]?.startPage ??
          publication.pageCount + 1) - 1
      : publication.pageCount;
  const pages =
    mode === "cover"
      ? []
      : allPages.filter(
          (p) => isRelease || (p.number >= from && p.number <= to),
        );
  const page = pages.find((page) => page.id === selected) ?? pages[0];
  const editable =
    (isRelease
      ? !!publication.release &&
        ["draft", "changes_requested"].includes(publication.release.status)
      : true) &&
    ["draft", "changes_requested", "published"].includes(publication.status);
  const live = publication.status === "published";
  // While a new chapter is being prepared, the published page sequence stays fixed.
  const canChangePages =
    editable && (isRelease || !(live && publication.release));
  const [target, setTarget] = useState(chapterId ?? "");
  const chapters = publication.chapters ?? [];
  const chapterStarts = new Map(
    chapters.map((chapter, index) => [chapter.startPage, index + 1]),
  );
  async function run(work: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save images.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function saveChapters(version: number, next: ChapterDraft[]) {
    await requestJson(
      `/api/publications/${publication.id}/chapters`,
      { version, chapters: next },
      "PUT",
    );
  }
  async function reload() {
    const response = await fetch(`/api/publications/${publication.id}`);
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error?.message ?? "Reload this draft to see its saved images.",
      );
    await onChange(data);
    setTextDirty(false);
  }
  function choose(input: HTMLInputElement, isCover: boolean) {
    const chosen = Array.from(input.files ?? []);
    input.value = "";
    if (!chosen.length) return;
    if (
      chosen.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      setError("Choose JPEG, PNG or WebP images up to 10 MB each.");
      return;
    }
    setError("");
    if (isCover) setCover(chosen[0]!);
    else
      setFiles((current) => [
        ...current,
        ...chosen.map((file) => ({ id: crypto.randomUUID(), file })),
      ]);
  }
  async function upload() {
    await run(async () => {
      let version = publication.version;
      const firstNewPage = allPages.length + 1;
      const queue = [
        ...(cover ? [{ id: "cover", file: cover, kind: "cover" }] : []),
        ...files.map((item) => ({ ...item, kind: "page" })),
      ];
      let completed = 0,
        uploadedPages = 0,
        failure: unknown = null;
      try {
        for (const item of queue) {
          setProgress(`Uploading ${completed + 1} of ${queue.length}`);
          const form = new FormData();
          form.set("file", item.file);
          form.set("kind", item.kind);
          form.set("version", String(version));
          if (item.kind === "page" && target && newChapter === null)
            form.set("chapterId", target);
          form.set(
            "alt",
            `${publication.kind === "artwork" ? "Artwork" : item.kind === "cover" ? "Comic cover" : "Comic page"}: ${item.file.name}`.slice(
              0,
              1000,
            ),
          );
          const response = await fetch(
            `/api/publications/${publication.id}/${isRelease ? "release/upload" : "upload"}`,
            { method: "POST", body: form },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              `${item.file.name}: ${data.error?.message ?? "Upload failed"}. ${completed} images saved; remaining images are kept for retry.`,
            );
          version = data.version;
          completed++;
          if (item.kind === "cover") setCover(null);
          else {
            uploadedPages++;
            setFiles((current) =>
              current.filter((file) => file.id !== item.id),
            );
          }
        }
      } catch (error) {
        failure = error;
      }
      setProgress("");
      // Mark the boundary once any page landed; retried pages then continue the new last chapter.
      if (newChapter !== null && uploadedPages) {
        try {
          await saveChapters(version, [
            ...(chapters.length
              ? chapters
              : firstNewPage > 1
                ? [{ title: "Chapter 1", startPage: 1 }]
                : []),
            {
              title: newChapter.trim() || `Chapter ${chapters.length + 1}`,
              startPage: firstNewPage,
            },
          ]);
          setNewChapter(null);
        } catch (error) {
          failure ??= error;
        }
      }
      await reload();
      if (failure) throw failure;
    });
  }
  return (
    <section className="publishing-media">
      <h2>
        {mode === "release"
          ? "Unpublished chapter pages"
          : mode === "pages"
            ? "Edit pages"
            : mode === "cover"
              ? "Cover & thumbnail"
              : publication.kind === "comic"
                ? "Build your comic’s reading order"
                : "Upload your artwork"}
      </h2>
      <p className="muted">
        {isRelease
          ? "Upload one page or a whole chapter. Preview, replace and reorder each page before submitting for review. These pages stay private until approval."
          : publication.kind === "comic"
            ? "Select all your pages together. Arrange them below, then upload the selection. The first four pages become the public preview."
            : "Your artwork is displayed as a single image. Add its description in Details."}
      </p>
      {mode !== "pages" && !isRelease && (
        <div className="cover-upload">
          <div>
            {cover ? (
              <LocalPreview file={cover} />
            ) : publication.hasCover ? (
              <img
                src={`/api/comics/${publication.id}/cover?v=${publication.version}`}
                alt="Saved cover"
              />
            ) : (
              <span>No image yet</span>
            )}
          </div>
          <label className="field">
            {publication.kind === "comic"
              ? "Cover / thumbnail"
              : "Artwork image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || !editable}
              onChange={(e) => choose(e.currentTarget, true)}
            />
          </label>
        </div>
      )}
      {mode !== "cover" && publication.kind === "comic" && (
        <>
          {live && publication.release && !isRelease && (
            <div className="notice" role="status">
              Page changes are paused while your new chapter is being prepared.
              Open the new chapter editor to finish or discard it before
              changing the published page sequence.
            </div>
          )}
          {canChangePages && (
            <label className="field">
              Select comic pages
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => choose(e.currentTarget, false)}
              />
            </label>
          )}
          {!!files.length && (
            <>
              <h3>Ready to upload · {files.length} pages</h3>
              {!!chapters.length &&
                newChapter === null &&
                !chapterId &&
                !isRelease && (
                  <label className="field">
                    Add these pages to
                    <select
                      value={target}
                      disabled={busy}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">
                        The end of the comic (
                        {chapters.at(-1)?.title ?? "last chapter"})
                      </option>
                      {chapters.slice(0, -1).map((chapter, index) => (
                        <option key={chapter.id} value={chapter.id}>
                          The end of chapter {index + 1}: {chapter.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              {!live && mode === "create" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newChapter !== null}
                    disabled={busy}
                    onChange={(e) =>
                      setNewChapter(
                        e.target.checked
                          ? `Chapter ${(chapters.length || (pages.length ? 1 : 0)) + 1}`
                          : null,
                      )
                    }
                  />
                  Start a new chapter with these pages
                </label>
              )}
              {newChapter !== null && (
                <label className="field">
                  New chapter title
                  <input
                    value={newChapter}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => setNewChapter(e.target.value)}
                  />
                </label>
              )}
              <div className="comic-filmstrip" aria-label="Selected pages">
                {files.map((item, index) => (
                  <figure key={item.id}>
                    <LocalPreview file={item.file} />
                    <figcaption>
                      Page {pages.length + index + 1} · {item.file.name}
                    </figcaption>
                    <div className="sample-actions">
                      {[-1, 1].map((direction) => (
                        <button
                          type="button"
                          key={direction}
                          className="secondary"
                          aria-label={`Move selected page ${index + 1} ${direction < 0 ? "earlier" : "later"}`}
                          disabled={
                            busy ||
                            index + direction < 0 ||
                            index + direction >= files.length
                          }
                          onClick={() =>
                            setFiles((current) => {
                              const next = [...current];
                              [next[index], next[index + direction]] = [
                                next[index + direction]!,
                                next[index]!,
                              ];
                              return next;
                            })
                          }
                        >
                          {direction < 0 ? "←" : "→"}
                        </button>
                      ))}
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
                    </div>
                  </figure>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {editable && (
        <button
          type="button"
          className="primary"
          disabled={busy || (!cover && !files.length)}
          onClick={upload}
        >
          {busy
            ? progress || "Saving…"
            : `Upload selected images${files.length + (cover ? 1 : 0) ? ` (${files.length + (cover ? 1 : 0)})` : ""}`}
        </button>
      )}
      <p className="muted">
        JPEG, PNG or WebP · up to 10 MB per image. Successfully uploaded images
        stay saved if the connection is interrupted.
      </p>
      {!!pages.length && (
        <>
          <h3>Saved pages · {pages.length}</h3>
          <div className="comic-filmstrip" aria-label="Saved pages">
            {pages.map((item, index) => (
              <figure
                key={item.id}
                className={page?.id === item.id ? "is-selected" : ""}
              >
                <button
                  type="button"
                  className="page-preview-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      textDirty &&
                      !window.confirm("Discard unsaved page text?")
                    )
                      return;
                    setTextDirty(false);
                    setSelected(item.id);
                  }}
                  aria-label={`Preview page ${item.number}`}
                >
                  <img
                    loading="lazy"
                    src={`/api/studio/${publication.id}/media/${item.number}?v=${publication.version}`}
                    alt={item.alt}
                  />
                </button>
                <figcaption>
                  {chapterStarts.has(item.number) && (
                    <strong className="chapter-start">
                      Chapter {chapterStarts.get(item.number)} starts
                    </strong>
                  )}
                  Page {item.number}
                  {isRelease
                    ? " · Unpublished"
                    : item.number <= 4
                      ? " · Free preview"
                      : ""}
                </figcaption>
                <div className="sample-actions">
                  {[-1, 1].map((direction) => (
                    <button
                      type="button"
                      key={direction}
                      className="secondary"
                      aria-label={`Move saved page ${item.number} ${direction < 0 ? "earlier" : "later"}`}
                      disabled={
                        busy ||
                        !canChangePages ||
                        index + direction < 0 ||
                        index + direction >= pages.length
                      }
                      onClick={() =>
                        run(async () => {
                          const ids = allPages.map((page) => page.id);
                          const position = ids.indexOf(item.id);
                          [ids[position], ids[position + direction]] = [
                            ids[position + direction]!,
                            ids[position]!,
                          ];
                          await requestJson(
                            `/api/publications/${publication.id}/${isRelease ? "release/order" : "pages/order"}`,
                            { version: publication.version, ids },
                          );
                          await reload();
                        })
                      }
                    >
                      {direction < 0 ? "← Earlier" : "Later →"}
                    </button>
                  ))}
                  {canChangePages && (
                    <>
                      <label
                        className={`secondary replace-label ${busy ? "is-disabled" : ""}`}
                      >
                        Replace image
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          aria-label={`Replace image for page ${item.number}`}
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (!file) return;
                            void run(async () => {
                              if (
                                ![
                                  "image/jpeg",
                                  "image/png",
                                  "image/webp",
                                ].includes(file.type) ||
                                file.size > 10 * 1024 * 1024
                              )
                                throw new Error(
                                  "Choose a JPEG, PNG or WebP image up to 10 MB.",
                                );
                              const form = new FormData();
                              form.set("file", file);
                              form.set("version", String(publication.version));
                              const response = await fetch(
                                `/api/publications/${publication.id}/pages/${item.id}/replace`,
                                { method: "POST", body: form },
                              );
                              const data = await response.json();
                              if (!response.ok)
                                throw new Error(
                                  data.error?.message ??
                                    "Could not replace the page.",
                                );
                              await reload();
                            });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary"
                        disabled={
                          busy || (!isRelease && live && pages.length <= 1)
                        }
                        aria-label={`Remove page ${item.number}`}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Permanently remove page ${item.number}? This cannot be undone.`,
                            )
                          )
                            return;
                          void run(async () => {
                            await requestJson(
                              `/api/publications/${publication.id}/pages/${item.id}`,
                              { version: publication.version },
                              "DELETE",
                            );
                            await reload();
                          });
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </figure>
            ))}
          </div>
        </>
      )}
      {mode === "create" &&
        publication.kind === "comic" &&
        publication.status === "published" && (
          <ChapterReleasePanel
            key={publication.release?.id ?? "none"}
            publication={publication}
            busy={busy}
            run={run}
            reload={reload}
          />
        )}
      {mode === "create" && publication.kind === "comic" && (
        <ChapterEditor
          key={publication.version}
          publication={publication}
          busy={busy}
          editable={editable}
          onSave={(next) =>
            run(async () => {
              await saveChapters(publication.version, next);
              await reload();
            })
          }
          onDelete={
            canChangePages
              ? (chapterId) =>
                  run(async () => {
                    await requestJson(
                      `/api/publications/${publication.id}/chapters/${chapterId}`,
                      { version: publication.version },
                      "DELETE",
                    );
                    await reload();
                  })
              : undefined
          }
        />
      )}
      {page && (
        <div
          className="page-text-editor"
          key={`${page.id}-${publication.version}`}
        >
          <a
            href={`/api/studio/${publication.id}/media/${page.number}`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`/api/studio/${publication.id}/media/${page.number}?v=${publication.version}`}
              alt={page.alt}
            />
          </a>
          <form
            onChange={() => setTextDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(async () => {
                await requestJson(
                  `/api/publications/${publication.id}/pages/${page.id}`,
                  {
                    version: publication.version,
                    alt: form.get("alt"),
                    storyText: form.get("storyText"),
                  },
                  "PATCH",
                );
                await reload();
              });
            }}
          >
            <h3>Page {page.number} · Story & accessibility</h3>
            <label className="field">
              Image description
              <input
                name="alt"
                defaultValue={page.alt}
                required
                minLength={10}
                maxLength={1000}
                disabled={busy || !editable}
              />
            </label>
            <label className="field">
              Story text
              <textarea
                name="storyText"
                rows={9}
                defaultValue={page.storyText ?? ""}
                maxLength={12000}
                disabled={busy || !editable}
                placeholder="Add dialogue, narration and the story on this page."
              />
            </label>
            <p className="muted">
              {isRelease
                ? "This chapter’s text stays private until publication. Authorized admin AI connections can read only admin-created comics explicitly shared in MCP settings."
                : "Published preview text helps public search. Other page text stays protected. AI access is limited to explicitly shared admin-created comics."}
            </p>
            {editable && (
              <button className="secondary" disabled={busy}>
                Save page text
              </button>
            )}
          </form>
        </div>
      )}
      <p role="status">{progress}</p>
      <p role="alert" className="form-error">
        {error}
      </p>
    </section>
  );
}
