"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  genres,
  type AccessModel,
  type AgeRating,
  type Genre,
  type PublicationKind,
  type PublicationStatus,
} from "@/domain/models";
import { requestJson, useMutation } from "./mutation";
import { Status } from "./ui";

export interface EditorData {
  id: string;
  title: string;
  synopsis: string;
  genre: Genre;
  kind: PublicationKind;
  access: AccessModel;
  ageRating: AgeRating;
  rightsConfirmed: boolean;
  version: number;
  status: PublicationStatus;
  pageCount: number;
  hasCover: boolean;
  feedback: string | null;
}
export function PublicationEditor({
  publication,
}: {
  publication?: EditorData;
}) {
  const router = useRouter(),
    action = useMutation();
  const editable =
    !publication || ["draft", "changes_requested"].includes(publication.status);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      title: form.get("title"),
      synopsis: form.get("synopsis"),
      genre: form.get("genre"),
      kind: publication?.kind ?? form.get("kind"),
      access: form.get("access"),
      ageRating: form.get("ageRating"),
      rightsConfirmed: form.get("rightsConfirmed") === "on",
    };
    await action.run(async () => {
      if (publication)
        await requestJson(
          `/api/publications/${publication.id}`,
          { publication: input, version: publication.version },
          "PATCH",
        );
      else {
        const result = await requestJson<{ id: string }>(
          "/api/publications",
          input,
        );
        router.push(`/studio/publications/${result.id}`);
      }
    }, "Draft saved.");
  }
  return (
    <section className="panel editor-panel">
      {publication && (
        <div className="section-head">
          <h2>Publication details</h2>
          <Status value={publication.status} />
        </div>
      )}
      {publication?.feedback && (
        <div className="notice">
          <strong>Editorial feedback</strong>
          <br />
          {publication.feedback}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={!editable || action.pending}>
          <label className="field">
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={100}
              defaultValue={publication?.title}
              placeholder="The name of your next world"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Publication type
              <select
                name="kind"
                defaultValue={publication?.kind ?? "comic"}
                disabled={!!publication}
              >
                <option value="comic">Comic</option>
                <option value="artwork">Artwork</option>
              </select>
            </label>
            <label className="field">
              Genre
              <select
                name="genre"
                defaultValue={publication?.genre ?? "Fantasy"}
              >
                {genres.map((genre) => (
                  <option key={genre}>{genre}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Synopsis
            <textarea
              name="synopsis"
              minLength={20}
              maxLength={1500}
              required
              defaultValue={publication?.synopsis}
              placeholder="Introduce your story in at least 20 characters."
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Reading access
              <select
                name="access"
                defaultValue={publication?.access ?? "free"}
              >
                <option value="free">Free with an account</option>
                <option value="membership">Membership</option>
                <option value="purchase">Individual purchase</option>
                <option value="both">Membership or purchase</option>
              </select>
            </label>
            <label className="field">
              Age rating
              <select
                name="ageRating"
                defaultValue={publication?.ageRating ?? "everyone"}
              >
                <option value="everyone">Everyone</option>
                <option value="teen">Teen · 13+</option>
                <option value="mature">Mature · 18+</option>
              </select>
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="rightsConfirmed"
              defaultChecked={publication?.rightsConfirmed}
            />
            I own this work or have permission to publish it, and have read the
            community guidelines.
          </label>
          <p className="muted">
            Artwork must use free access. Premium comics remain preview-only for
            readers without an entitlement; payments are not connected yet.
          </p>
          {editable && (
            <button className="primary" disabled={action.pending}>
              {action.pending
                ? "Saving…"
                : publication
                  ? "Save draft"
                  : "Create draft"}
            </button>
          )}
        </fieldset>
        <p role="alert" className="form-error">
          {action.error}
        </p>
        <p role="status" className="form-success">
          {action.success}
        </p>
      </form>
      {publication && editable && (
        <div className="submit-panel">
          <h3>Ready for the editorial team?</h3>
          <p className="muted">
            Upload a cover
            {publication.kind === "comic"
              ? " and at least five pages in reading order"
              : ""}
            , confirm rights, then submit. Submitted work is locked while it is
            reviewed.
          </p>
          <button
            className="secondary"
            disabled={
              action.pending ||
              !publication.hasCover ||
              (publication.kind === "comic" && publication.pageCount < 5)
            }
            onClick={() =>
              action.run(async () => {
                await requestJson(
                  `/api/publications/${publication.id}/submit`,
                  { version: publication.version },
                );
              }, "Submitted for editorial review.")
            }
          >
            Submit for review
          </button>
        </div>
      )}
    </section>
  );
}
export function UploadForm({ publication }: { publication: EditorData }) {
  const action = useMutation();
  const editable = ["draft", "changes_requested"].includes(publication.status);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    form.set("version", String(publication.version));
    await action.run(async () => {
      const response = await fetch(
        `/api/publications/${publication.id}/upload`,
        { method: "POST", body: form },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "Upload failed.");
      element.reset();
    }, "Image uploaded.");
  }
  return (
    <section className="panel">
      <h2>Artwork & pages</h2>
      {publication.hasCover && (
        <img
          className="editor-cover"
          src={`/api/comics/${publication.id}/cover?v=${publication.version}`}
          alt="Current cover"
        />
      )}
      <p className="muted">
        {publication.hasCover ? "Cover uploaded" : "A cover is required"} ·{" "}
        {publication.pageCount} pages uploaded
      </p>
      {editable && (
        <form onSubmit={upload}>
          <fieldset disabled={action.pending}>
            <label className="field">
              Upload as
              <select name="kind">
                <option value="cover">Cover / artwork</option>
                {publication.kind === "comic" && (
                  <option value="page">
                    Next page (page {publication.pageCount + 1})
                  </option>
                )}
              </select>
            </label>
            <label className="field">
              Image
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <p className="muted">
              JPEG, PNG, or WebP. Up to 10 MB. Images are validated, resized,
              and stripped of metadata before storage.
            </p>
            <label className="field">
              Image description
              <textarea
                name="alt"
                required
                minLength={10}
                maxLength={1000}
                placeholder="Describe the scene for readers using assistive technology."
              />
            </label>
            <button className="primary" disabled={action.pending}>
              {action.pending ? "Processing image…" : "Upload image"}
            </button>
          </fieldset>
          <p role="alert" className="form-error">
            {action.error}
          </p>
          <p role="status" className="form-success">
            {action.success}
          </p>
        </form>
      )}
      <Link href="/guidelines" className="text-link">
        Publishing guidelines
      </Link>
    </section>
  );
}
