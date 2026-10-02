"use client";
import { ApplicationUploads } from "./application-uploads";
import { useRouter } from "next/navigation";
import { requestJson, useMutation } from "./mutation";
import type { AuthorApplication } from "@/domain/author-application";
export type ApplicationView = Omit<
  AuthorApplication,
  "samples" | "thumbnail" | "createdAt" | "updatedAt"
> & {
  samples: { id: string; alt: string }[];
  thumbnail?: { id: string; alt: string } | null;
};
export function StartApplication() {
  const action = useMutation(),
    router = useRouter();
  return (
    <>
      <button
        className="primary"
        disabled={action.pending}
        onClick={() =>
          action.run(async () => {
            await requestJson("/api/author-applications", {});
            router.refresh();
          })
        }
      >
        Start my application
      </button>
      <p role="alert" className="form-error">
        {action.error}
      </p>
    </>
  );
}
export function ApplicationEditor({
  application,
}: {
  application: ApplicationView;
}) {
  const action = useMutation();
  const endpoint = `/api/author-applications/${application.id}`;
  const editable = ["draft", "changes_requested", "rejected"].includes(
    application.status,
  );
  return (
    <>
      <div className="notice">
        Status: <strong>{application.status.replaceAll("_", " ")}</strong>
        {application.feedback && (
          <p>Editorial feedback: {application.feedback}</p>
        )}
        {application.status === "submitted" && (
          <p>Your samples are locked while the editorial team reviews them.</p>
        )}
      </div>
      {editable && (
        <form
          className="panel section"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void action.run(async () => {
              await requestJson(
                endpoint,
                {
                  version: application.version,
                  application: {
                    introduction: form.get("introduction"),
                    portfolioUrl: form.get("portfolioUrl"),
                    sampleKind: form.get("sampleKind"),
                    processNotes: form.get("processNotes"),
                    rightsConfirmed: form.get("rightsConfirmed") === "on",
                  },
                },
                "PATCH",
              );
            }, "Application details saved.");
          }}
        >
          <h2>Introduce your work</h2>
          <label className="field">
            About you
            <textarea
              name="introduction"
              defaultValue={application.introduction}
              required
              minLength={30}
              maxLength={2000}
              placeholder="Tell us what you create and what you would like to publish."
            />
          </label>
          <label className="field">
            Portfolio or creator profile (optional)
            <input
              type="url"
              name="portfolioUrl"
              defaultValue={application.portfolioUrl}
              placeholder="https://"
            />
          </label>
          <label className="field">
            Sample type
            <select name="sampleKind" defaultValue={application.sampleKind}>
              <option value="artwork">
                Original artwork (at least 1 image)
              </option>
              <option value="comic">Short comic (at least 2 pages)</option>
            </select>
          </label>
          <label className="field">
            How you made this work
            <textarea
              name="processNotes"
              defaultValue={application.processNotes}
              required
              minLength={30}
              maxLength={2000}
              placeholder="Describe your process, tools, collaborators and any AI assistance. You may include sketches or work-in-progress among your samples."
            />
          </label>
          <label className="policy-row">
            <input
              type="checkbox"
              name="rightsConfirmed"
              defaultChecked={application.rightsConfirmed}
              required
            />
            I created this work or have permission from all collaborators, and I
            have the right to submit it for review.
          </label>
          <button className="secondary" disabled={action.pending}>
            Save application details
          </button>
        </form>
      )}
      {application.thumbnail && (
        <section className="panel section">
          <h2>Thumbnail</h2>
          <img
            className="application-thumbnail"
            src={`${endpoint}/samples/${application.thumbnail.id}`}
            alt={application.thumbnail.alt}
          />
          {editable && (
            <button
              className="secondary"
              disabled={action.pending}
              onClick={() =>
                action.run(async () => {
                  await requestJson(
                    `${endpoint}/samples/${application.thumbnail!.id}`,
                    { version: application.version },
                    "DELETE",
                  );
                })
              }
            >
              Remove thumbnail
            </button>
          )}
        </section>
      )}
      <section className="panel section">
        <h2>Your private samples ({application.samples.length})</h2>
        <p className="muted">
          Only you and administrators can view these images. They will not
          appear in the public catalog.
        </p>
        <div className="application-samples">
          {application.samples.map((sample, index) => (
            <figure key={sample.id}>
              <a
                href={`${endpoint}/samples/${sample.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`${endpoint}/samples/${sample.id}`}
                  alt={sample.alt}
                />
              </a>
              <figcaption>
                Sample {index + 1}: {sample.alt}
              </figcaption>
              {editable && (
                <div className="sample-actions">
                  {[-1, 1].map((direction) => (
                    <button
                      key={direction}
                      className="secondary"
                      disabled={
                        action.pending ||
                        index + direction < 0 ||
                        index + direction >= application.samples.length
                      }
                      onClick={() =>
                        action.run(async () => {
                          const ids = application.samples.map(
                            (item) => item.id,
                          );
                          [ids[index], ids[index + direction]] = [
                            ids[index + direction]!,
                            ids[index]!,
                          ];
                          await requestJson(`${endpoint}/reorder`, {
                            version: application.version,
                            ids,
                          });
                        })
                      }
                      aria-label={`Move page ${index + 1} ${direction < 0 ? "earlier" : "later"}`}
                    >
                      {direction < 0 ? "← Earlier" : "Later →"}
                    </button>
                  ))}
                </div>
              )}
              {editable && (
                <button
                  className="secondary"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(async () => {
                      await requestJson(
                        `${endpoint}/samples/${sample.id}`,
                        { version: application.version },
                        "DELETE",
                      );
                    })
                  }
                >
                  Remove sample {index + 1}
                </button>
              )}
            </figure>
          ))}
        </div>
        {editable && (
          <ApplicationUploads
            endpoint={endpoint}
            version={application.version}
            disabled={action.pending}
          />
        )}
      </section>
      {editable && (
        <button
          className="primary section"
          disabled={action.pending}
          onClick={() =>
            action.run(async () => {
              await requestJson(`${endpoint}/submit`, {
                version: application.version,
              });
            }, "Application submitted for editorial review.")
          }
        >
          Submit application
        </button>
      )}
      <p role="alert" className="form-error">
        {action.error}
      </p>
      <p role="status" className="form-success">
        {action.success}
      </p>
    </>
  );
}
export function ApplicationDecision({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const action = useMutation();
  return (
    <form
      className="panel section"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(async () => {
          await requestJson(`/api/admin/author-applications/${id}`, {
            version,
            decision: form.get("decision"),
            note: form.get("note"),
            reviewedSamples: form.get("reviewedSamples") === "on",
          });
        }, "Decision saved. Approved applicants can sign in to Studio.");
      }}
    >
      <h2>Author access decision</h2>
      <p>
        Assess originality using the samples, creation process and portfolio
        evidence. Request sketches or further evidence when authorship is
        unclear.
      </p>
      <label className="field">
        Decision
        <select name="decision" defaultValue="changes_requested">
          <option value="changes_requested">
            Request more evidence / changes
          </option>
          <option value="approved">Approve author access</option>
          <option value="rejected">Reject application</option>
        </select>
      </label>
      <label className="field">
        Feedback to applicant
        <textarea name="note" required minLength={10} maxLength={1500} />
      </label>
      <label className="policy-row">
        <input name="reviewedSamples" type="checkbox" required />I reviewed all
        samples and the applicant’s authorship explanation.
      </label>
      <button className="primary" disabled={action.pending}>
        Save author decision
      </button>
      <p role="alert" className="form-error">
        {action.error}
      </p>
      <p role="status" className="form-success">
        {action.success}
      </p>
    </form>
  );
}
