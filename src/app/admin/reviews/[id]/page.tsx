import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { Intro, Status, accessLabels } from "@/components/ui";
import { ReviewForm } from "@/components/admin-actions";
export default async function Review({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(["admin"]);
  const { id } = await params;
  const services = getServices(),
    publication = await services.publications.find(id);
  if (!publication) notFound();
  const pages = await services.publications.pages(id);
  return (
    <>
      <Intro
        title={publication.title}
        description={`Submitted by ${publication.authorName}`}
        action={<Status value={publication.status} />}
      />
      <div className="editor-layout">
        <section className="panel">
          <h2>Submission overview</h2>
          {publication.coverKey && (
            <img
              className="editor-cover"
              src={`/api/comics/${id}/cover`}
              alt="Submission cover"
            />
          )}
          <p>{publication.synopsis}</p>
          <dl className="review-facts">
            <dt>Access</dt>
            <dd>{accessLabels[publication.access]}</dd>
            <dt>Age rating</dt>
            <dd>{publication.ageRating}</dd>
            <dt>Publishing rights</dt>
            <dd>
              {publication.rightsConfirmed
                ? "Declared by the author — verify evidence"
                : "Not declared"}
            </dd>
            <dt>Pages</dt>
            <dd>{publication.pageCount}</dd>
          </dl>
          {publication.feedback && (
            <div className="notice">
              Previous feedback: {publication.feedback}
            </div>
          )}
        </section>
        <ReviewForm
          id={id}
          version={publication.version}
          reviewable={
            publication.status === "submitted" &&
            publication.authorId !== user.id
          }
        />
      </div>
      <section className="panel">
        <h2>Review every page</h2>
        <div className="page-thumbnails">
          {pages.map((page) => (
            <figure key={page.id}>
              <a
                href={`/api/studio/${id}/media/${page.number}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  loading="lazy"
                  src={`/api/studio/${id}/media/${page.number}`}
                  alt={page.alt}
                />
              </a>
              <figcaption>Page {page.number}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </>
  );
}
