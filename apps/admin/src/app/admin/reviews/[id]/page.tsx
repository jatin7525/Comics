import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { Intro, Status, accessLabels } from "@/components/ui";
import { ReleaseReviewForm, ReviewForm } from "@/components/admin-actions";
import { chapterRanges } from "@/domain/chapters";
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
  const chapters = chapterRanges(publication);
  const release = publication.release;
  const releasePages = pages.filter(
    (page) => page.number > publication.pageCount,
  );
  const publicPages = pages.filter(
    (page) => page.number <= publication.pageCount,
  );
  const groups = chapters.length
    ? chapters.map((chapter) => ({
        key: chapter.id,
        heading: `Chapter ${chapter.number} · ${chapter.title}`,
        pages: publicPages.filter(
          (page) =>
            page.number >= chapter.startPage && page.number <= chapter.endPage,
        ),
      }))
    : [{ key: "all", heading: null, pages: publicPages }];
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
              src={`/api/comics/${id}/cover?v=${publication.version}`}
              alt="Submission cover"
            />
          )}
          <p>{publication.synopsis}</p>
          <dl className="review-facts">
            <dt>Type</dt>
            <dd>
              {publication.original
                ? "Original (platform publication)"
                : "Independent creator"}
            </dd>
            <dt>Access</dt>
            <dd>{accessLabels[publication.access]}</dd>
            <dt>Price (INR)</dt>
            <dd>
              {publication.pricePaise
                ? `₹${(publication.pricePaise / 100).toFixed(2)}`
                : "Not set"}
            </dd>
            <dt>Tags</dt>
            <dd>{publication.tags?.join(", ") || "None"}</dd>
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
            <dt>Chapters</dt>
            <dd>
              {chapters.length
                ? chapters
                    .map(
                      (chapter) =>
                        `${chapter.number}. ${chapter.title} (pages ${chapter.startPage}–${chapter.endPage})`,
                    )
                    .join("; ")
                : "Single continuous story"}
            </dd>
          </dl>
          {publication.feedback && (
            <div className="notice">
              Previous feedback: {publication.feedback}
            </div>
          )}
        </section>
        {release ? (
          <ReleaseReviewForm
            id={id}
            version={publication.version}
            reviewable={
              release.status === "submitted" &&
              (publication.authorId !== user.id || !!publication.original)
            }
          />
        ) : (
          <ReviewForm
            id={id}
            version={publication.version}
            reviewable={
              publication.status === "submitted" &&
              (publication.authorId !== user.id || !!publication.original)
            }
          />
        )}
      </div>
      {release && (
        <section className="panel">
          <h2>
            New chapter: {release.title} ({release.status.replace("_", " ")})
          </h2>
          <p className="muted">
            {releasePages.length} new pages, to be published as pages{" "}
            {publication.pageCount + 1}–
            {publication.pageCount + releasePages.length}. Readers cannot see
            them until approved.
          </p>
          <div className="page-thumbnails">
            {releasePages.map((page) => (
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
                <figcaption>
                  New page {page.number - publication.pageCount}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <h2>{release ? "Published pages" : "Review every page"}</h2>
        {groups.map((group) => (
          <div key={group.key}>
            {group.heading && <h3>{group.heading}</h3>}
            <div className="page-thumbnails">
              {group.pages.map((page) => (
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
                  {page.storyText && (
                    <p style={{ whiteSpace: "pre-wrap" }}>{page.storyText}</p>
                  )}
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
