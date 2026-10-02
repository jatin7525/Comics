"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "./mutation";

function FilePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const value = URL.createObjectURL(file);
    if (image.current) image.current.src = value;
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return <img ref={image} alt={`Preview of ${file.name}`} />;
}
export function ApplicationUploads({
  endpoint,
  version,
  disabled,
}: {
  endpoint: string;
  version: number;
  disabled: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [pageError, setPageError] = useState("");
  const [thumbnailError, setThumbnailError] = useState("");
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState("");
  const action = useMutation();
  const router = useRouter();
  const busy = disabled || action.pending || validating;
  async function select(input: HTMLInputElement, cover = false) {
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (!list.length) return;
    const setError = cover ? setThumbnailError : setPageError;
    setError("");
    if (cover) setThumbnail(null);
    else setFiles([]);
    setValidating(true);
    try {
      for (const file of list) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size === 0 ||
          file.size > 3 * 1024 * 1024
        )
          throw new Error(
            `${file.name}: choose a non-empty JPEG, PNG or WebP up to 3 MB.`,
          );
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode().catch(() => {
            throw new Error(`${file.name}: this image could not be opened.`);
          });
          if (image.naturalWidth * image.naturalHeight > 25_000_000)
            throw new Error(
              `${file.name}: images must be no larger than 25 megapixels.`,
            );
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      if (cover) setThumbnail(list[0] ?? null);
      else setFiles(list);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not validate the selected images.",
      );
    } finally {
      setValidating(false);
    }
  }
  return (
    <div className="section">
      <h3>Add pages and thumbnail</h3>
      <p className="muted">
        Select multiple images, arrange them in reading order, then upload. Each
        image can be up to 3 MB. The thumbnail is separate from your sample
        pages. Save application details first.
      </p>
      <label className="field">
        Sample images
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          aria-describedby="sample-selection-error"
          onChange={(event) => void select(event.currentTarget)}
        />
      </label>
      <p id="sample-selection-error" role="alert" className="form-error">
        {pageError}
      </p>
      <p className="muted">{files.length} pages selected for upload.</p>
      <div className="application-samples">
        {files.map((file, index) => (
          <figure key={`${file.name}-${file.lastModified}-${index}`}>
            <FilePreview file={file} />
            <figcaption>
              Page {index + 1}: {file.name}
            </figcaption>
            <div className="sample-actions">
              {[-1, 1].map((direction) => (
                <button
                  type="button"
                  className="secondary"
                  key={direction}
                  disabled={
                    busy ||
                    index + direction < 0 ||
                    index + direction >= files.length
                  }
                  aria-label={`Move selected page ${index + 1} ${direction < 0 ? "earlier" : "later"}`}
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
                  {direction < 0 ? "← Earlier" : "Later →"}
                </button>
              ))}
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove selected page {index + 1}
              </button>
            </div>
          </figure>
        ))}
      </div>
      <label className="field">
        Thumbnail image
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          aria-describedby="thumbnail-selection-error"
          onChange={(event) => void select(event.currentTarget, true)}
        />
      </label>
      <p id="thumbnail-selection-error" role="alert" className="form-error">
        {thumbnailError}
      </p>
      {thumbnail && (
        <figure className="application-thumbnail">
          <FilePreview file={thumbnail} />
          <figcaption>{thumbnail.name}</figcaption>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setThumbnail(null)}
          >
            Clear selected thumbnail
          </button>
        </figure>
      )}
      <button
        className="secondary"
        disabled={
          busy ||
          !!pageError ||
          !!thumbnailError ||
          (!files.length && !thumbnail)
        }
        onClick={() =>
          action.run(async () => {
            let nextVersion = version;
            const uploads = [
              ...files.map((file) => ({ file, kind: "sample" })),
              ...(thumbnail ? [{ file: thumbnail, kind: "thumbnail" }] : []),
            ];
            try {
              for (const [index, item] of uploads.entries()) {
                setProgress(`Uploading ${index + 1} of ${uploads.length}…`);
                const form = new FormData();
                form.set("file", item.file);
                form.set("kind", item.kind);
                form.set(
                  "alt",
                  `${item.kind === "thumbnail" ? "Application thumbnail" : "Sample page"}: ${item.file.name}`.slice(
                    0,
                    1000,
                  ),
                );
                form.set("version", String(nextVersion));
                const response = await fetch(`${endpoint}/upload`, {
                  method: "POST",
                  body: form,
                });
                const data = await response.json();
                if (!response.ok)
                  throw new Error(
                    `${index} of ${uploads.length} uploaded. ${data.error?.message ?? "Upload failed."} Reload to see saved images before retrying.`,
                  );
                nextVersion = data.version;
              }
              setFiles([]);
              setThumbnail(null);
            } finally {
              setProgress("");
              router.refresh();
            }
          }, "Images uploaded.")
        }
      >
        Upload selected images
      </button>
      <p role="status">
        {validating ? "Checking selected images…" : progress || action.success}
      </p>
      <p role="alert" className="form-error">
        {action.error}
      </p>
    </div>
  );
}
