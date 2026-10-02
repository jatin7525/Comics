"use client";
import { useState } from "react";
import {
  genres,
  type AccessModel,
  type AgeRating,
  type Genre,
  type PublicationKind,
  type PublicationStatus,
} from "@/domain/models";
import { requestJson } from "./mutation";
import { Status } from "./ui";
import { PublicationMedia } from "./publication-media";
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
  tags?: string[];
  pricePaise?: number | null;
  pages?: { id: string; number: number; alt: string; storyText?: string }[];
}
export function PublicationEditor({
  publication,
  initialKind,
}: {
  publication?: EditorData;
  initialKind?: PublicationKind;
}) {
  const [draft, setDraft] = useState(publication);
  const [kind, setKind] = useState<PublicationKind | undefined>(
    publication?.kind ?? initialKind,
  );
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [access, setAccess] = useState<AccessModel>(
    publication?.access ?? "free",
  );
  const editable =
    !draft || ["draft", "changes_requested"].includes(draft.status);
  const steps = [
    "Details",
    kind === "artwork" ? "Artwork" : "Pages & text",
    "Access & price",
    "Review",
  ];
  async function save(form: FormData, pricing = false) {
    setBusy(true);
    setError("");
    try {
      const value = {
        title: draft?.title,
        synopsis: draft?.synopsis,
        genre: draft?.genre ?? "Fantasy",
        kind: kind!,
        access: draft?.access ?? "free",
        ageRating: draft?.ageRating ?? "everyone",
        rightsConfirmed: draft?.rightsConfirmed ?? false,
        tags: draft?.tags ?? [],
        pricePaise: draft?.pricePaise ?? null,
      };
      if (pricing) {
        value.access = kind === "artwork" ? "free" : access;
        value.rightsConfirmed = form.get("rightsConfirmed") === "on";
        value.pricePaise = ["purchase", "both"].includes(value.access)
          ? Math.round(Number(form.get("price")) * 100)
          : null;
      } else {
        value.title = String(form.get("title"));
        value.synopsis = String(form.get("synopsis"));
        value.genre = form.get("genre") as Genre;
        value.ageRating = form.get("ageRating") as AgeRating;
        value.tags = String(form.get("tags") ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      let id = draft?.id;
      if (id)
        await requestJson(
          `/api/publications/${id}`,
          { publication: value, version: draft!.version },
          "PATCH",
        );
      else {
        const result = await requestJson<{ id: string }>(
          "/api/publications",
          value,
        );
        id = result.id;
        window.history.replaceState(null, "", `/studio/publications/${id}`);
      }
      const response = await fetch(`/api/publications/${id}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "Could not reload draft.");
      setDraft(data);
      setStep(pricing ? 3 : 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }
  if (!kind)
    return (
      <section className="publication-kind-picker">
        <button className="panel" onClick={() => setKind("comic")}>
          <h2>Create a comic</h2>
          <p>
            A cover, ordered pages, story text, and your choice of reading
            access.
          </p>
          <span className="text-link">Start a comic</span>
        </button>
        <button className="panel" onClick={() => setKind("artwork")}>
          <h2>Publish artwork</h2>
          <p>
            A single original image with a description and tags for discovery.
          </p>
          <span className="text-link">Start artwork</span>
        </button>
      </section>
    );
  return (
    <section className="panel publishing-workspace">
      <div className="section-head">
        <h2>{kind === "comic" ? "Comic publisher" : "Artwork publisher"}</h2>
        {draft && <Status value={draft.status} />}
      </div>
      <nav className="publishing-steps" aria-label="Publishing steps">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={busy || (!draft && index > 0)}
            aria-current={step === index ? "step" : undefined}
            onClick={() => {
              setError("");
              setStep(index);
            }}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {draft?.feedback && (
        <div className="notice">Editorial feedback: {draft.feedback}</div>
      )}
      {step === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(new FormData(e.currentTarget));
          }}
        >
          <fieldset disabled={busy || !editable}>
            <h2>
              Tell readers about your {kind === "comic" ? "comic" : "artwork"}
            </h2>
            <label className="field">
              Title
              <input
                name="title"
                required
                minLength={3}
                maxLength={100}
                defaultValue={draft?.title}
              />
            </label>
            <label className="field">
              {kind === "comic" ? "Synopsis" : "Artwork description"}
              <textarea
                name="synopsis"
                required
                minLength={20}
                maxLength={1500}
                defaultValue={draft?.synopsis}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Genre
                <select name="genre" defaultValue={draft?.genre ?? "Fantasy"}>
                  {genres.map((genre) => (
                    <option key={genre}>{genre}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Age rating
                <select
                  name="ageRating"
                  defaultValue={draft?.ageRating ?? "everyone"}
                >
                  <option value="everyone">Everyone</option>
                  <option value="teen">Teen · 13+</option>
                  <option value="mature">Mature · 18+</option>
                </select>
              </label>
            </div>
            <label className="field">
              Tags
              <input
                name="tags"
                defaultValue={draft?.tags?.join(", ")}
                placeholder="space adventure, friendship, mystery"
              />
            </label>
            <p className="muted">
              Separate tags with commas. Use up to 20 relevant tags to help
              readers discover your work.
            </p>
            {editable && (
              <button className="primary">
                {busy ? "Saving…" : "Save & continue"}
              </button>
            )}
          </fieldset>
        </form>
      )}
      {step === 1 && draft && (
        <>
          <PublicationMedia
            publication={draft}
            onChange={setDraft}
            onBusy={setBusy}
          />
          <div className="wizard-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStep(0)}
            >
              Back
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => setStep(2)}
            >
              Continue to access
            </button>
          </div>
        </>
      )}
      {step === 2 && draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(new FormData(e.currentTarget), true);
          }}
        >
          <fieldset disabled={busy || !editable}>
            <h2>
              {kind === "comic"
                ? "Choose how readers get access"
                : "Publishing permissions"}
            </h2>
            {kind === "comic" ? (
              <>
                <label className="field">
                  Reading access
                  <select
                    aria-label="Reading access"
                    value={access}
                    onChange={(e) => setAccess(e.target.value as AccessModel)}
                  >
                    <option value="free">Free with an account</option>
                    <option value="membership">Membership</option>
                    <option value="purchase">Individual purchase</option>
                    <option value="both">Membership or purchase</option>
                  </select>
                </label>
                {["purchase", "both"].includes(access) && (
                  <label className="field">
                    Price (INR)
                    <input
                      name="price"
                      type="number"
                      required
                      min="0.01"
                      max="1000000"
                      step="0.01"
                      defaultValue={
                        draft.pricePaise ? draft.pricePaise / 100 : ""
                      }
                      placeholder="99.00"
                    />
                  </label>
                )}
                <p className="muted">
                  The first four pages are a free preview. Your price is saved
                  with the comic; checkout is not connected yet.
                </p>
              </>
            ) : (
              <p>Your artwork is publicly viewable for free.</p>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="rightsConfirmed"
                required
                defaultChecked={draft.rightsConfirmed}
              />
              I own this work or have permission to publish it, and have read
              the community guidelines.
            </label>
            <div className="wizard-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button className="primary">Save & review</button>
            </div>
          </fieldset>
        </form>
      )}
      {step === 3 && draft && (
        <>
          <h2>Review before submission</h2>
          <div className="publication-review">
            {draft.hasCover && (
              <img
                src={`/api/comics/${draft.id}/cover?v=${draft.version}`}
                alt={draft.title}
              />
            )}
            <div>
              <h3>{draft.title}</h3>
              <p>{draft.synopsis}</p>
              <p>{draft.tags?.join(" · ")}</p>
              <p>
                {kind === "comic"
                  ? `${draft.pageCount} pages · ${draft.access}`
                  : "Public artwork"}
                {draft.pricePaise
                  ? ` · ₹${(draft.pricePaise / 100).toFixed(2)}`
                  : ""}
              </p>
            </div>
          </div>
          <ul className="review-checklist">
            <li>
              {draft.hasCover ? "✓" : "○"}{" "}
              {kind === "comic" ? "Cover" : "Artwork"} uploaded
            </li>
            {kind === "comic" && (
              <li>
                {draft.pageCount >= 5 ? "✓" : "○"} At least five comic pages (
                {draft.pageCount} saved)
              </li>
            )}
            <li>
              {draft.rightsConfirmed ? "✓" : "○"} Publishing rights confirmed
            </li>
          </ul>
          <p className="muted">
            Submitting locks editing until the editorial team reviews your work.
          </p>
          {editable && (
            <button
              className="primary"
              disabled={
                busy ||
                !draft.hasCover ||
                !draft.rightsConfirmed ||
                (kind === "comic" && draft.pageCount < 5)
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await requestJson(`/api/publications/${draft.id}/submit`, {
                    version: draft.version,
                  });
                  setDraft({
                    ...draft,
                    status: "submitted",
                    version: draft.version + 1,
                  });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not submit.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Submit for review
            </button>
          )}
          {draft.status === "submitted" && (
            <div className="notice" role="status">
              Submitted. Your work is awaiting editorial review.
            </div>
          )}
        </>
      )}
      <p role="alert" className="form-error">
        {error}
      </p>
    </section>
  );
}
