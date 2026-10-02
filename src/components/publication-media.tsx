"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "./mutation";
import type { EditorData } from "./publication-editor";

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
}: {
  publication: EditorData;
  onChange: (value: EditorData) => void;
  onBusy: (value: boolean) => void;
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const pages = publication.pages ?? [];
  const page = pages.find((page) => page.id === selected) ?? pages[0];
  const editable = ["draft", "changes_requested"].includes(publication.status);
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
  async function reload() {
    const response = await fetch(`/api/publications/${publication.id}`);
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error?.message ?? "Reload this draft to see its saved images.",
      );
    onChange(data);
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
      const queue = [
        ...(cover ? [{ id: "cover", file: cover, kind: "cover" }] : []),
        ...files.map((item) => ({ ...item, kind: "page" })),
      ];
      let completed = 0;
      try {
        for (const item of queue) {
          setProgress(`Uploading ${completed + 1} of ${queue.length}`);
          const form = new FormData();
          form.set("file", item.file);
          form.set("kind", item.kind);
          form.set("version", String(version));
          form.set(
            "alt",
            `${publication.kind === "artwork" ? "Artwork" : item.kind === "cover" ? "Comic cover" : "Comic page"}: ${item.file.name}`.slice(
              0,
              1000,
            ),
          );
          const response = await fetch(
            `/api/publications/${publication.id}/upload`,
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
          else
            setFiles((current) =>
              current.filter((file) => file.id !== item.id),
            );
        }
      } finally {
        setProgress("");
        await reload();
      }
    });
  }
  return (
    <section className="publishing-media">
      <h2>
        {publication.kind === "comic"
          ? "Build your comic’s reading order"
          : "Upload your artwork"}
      </h2>
      <p className="muted">
        {publication.kind === "comic"
          ? "Select all your pages together. Arrange them below, then upload the selection. The first four pages become the public preview."
          : "Your artwork is displayed as a single image. Add its description in Details."}
      </p>
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
          {publication.kind === "comic" ? "Cover / thumbnail" : "Artwork image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || !editable}
            onChange={(e) => choose(e.currentTarget, true)}
          />
        </label>
      </div>
      {publication.kind === "comic" && (
        <>
          {editable && (
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
                  onClick={() => setSelected(item.id)}
                  aria-label={`Preview page ${item.number}`}
                >
                  <img
                    loading="lazy"
                    src={`/api/studio/${publication.id}/media/${item.number}?v=${publication.version}`}
                    alt={item.alt}
                  />
                </button>
                <figcaption>
                  Page {item.number}
                  {item.number <= 4 ? " · Free preview" : ""}
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
                        !editable ||
                        index + direction < 0 ||
                        index + direction >= pages.length
                      }
                      onClick={() =>
                        run(async () => {
                          const ids = pages.map((page) => page.id);
                          [ids[index], ids[index + direction]] = [
                            ids[index + direction]!,
                            ids[index]!,
                          ];
                          await requestJson(
                            `/api/publications/${publication.id}/pages/order`,
                            { version: publication.version, ids },
                          );
                          await reload();
                        })
                      }
                    >
                      {direction < 0 ? "← Earlier" : "Later →"}
                    </button>
                  ))}
                </div>
              </figure>
            ))}
          </div>
        </>
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
              Readers can read this text alongside the image. Text on the first
              four pages also helps public search. Later pages follow the
              comic’s access rules.
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
