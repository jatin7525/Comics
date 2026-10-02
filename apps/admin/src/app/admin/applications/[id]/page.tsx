import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { ApplicationDecision } from "@/components/author-application";
import { Intro } from "@/components/ui";
export default async function ReviewApplication({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser(["admin"]);
  const { id } = await params;
  const application = await getServices().applications.find(id);
  if (!application) notFound();
  return (
    <>
      <Intro
        title={`Application from ${application.name}`}
        description={`Status: ${application.status.replaceAll("_", " ")}`}
      />
      <section className="panel prose">
        <h2>About the creator</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{application.introduction}</p>
        <h2>Creation process</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{application.processNotes}</p>
        {application.portfolioUrl && (
          <a
            className="text-link"
            href={application.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open submitted portfolio
          </a>
        )}
        <p>
          Publishing rights declaration:{" "}
          {application.rightsConfirmed
            ? "Confirmed by applicant"
            : "Not confirmed"}
        </p>
        {application.feedback && <p>Latest feedback: {application.feedback}</p>}
      </section>
      {application.thumbnail && (
        <section className="panel section">
          <h2>Thumbnail</h2>
          <img
            className="application-thumbnail"
            src={`/api/admin/author-applications/${id}/samples/${application.thumbnail.id}`}
            alt={application.thumbnail.alt}
          />
        </section>
      )}
      <section className="panel section">
        <h2>Private {application.sampleKind} samples</h2>
        <div className="application-samples">
          {application.samples.map((sample, index) => (
            <figure key={sample.id}>
              <a
                href={`/api/admin/author-applications/${id}/samples/${sample.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`/api/admin/author-applications/${id}/samples/${sample.id}`}
                  alt={sample.alt}
                />
              </a>
              <figcaption>
                Sample {index + 1}: {sample.alt}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      {application.status === "submitted" && (
        <ApplicationDecision id={id} version={application.version} />
      )}
    </>
  );
}
