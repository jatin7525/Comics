import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { ProgressRecorder, ReportForm } from "@/components/reader-actions";
import { accessLabels } from "@/components/ui";

export default async function Read({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const route = await params,
    number = Number(route.page);
  if (!Number.isSafeInteger(number) || number < 1 || number > 300) notFound();
  const services = getServices();
  const publication = await services.publications.findBySlug(route.slug);
  if (
    !publication ||
    publication.status !== "published" ||
    publication.kind !== "comic" ||
    number > publication.pageCount
  )
    notFound();
  const user = await currentUser();
  const { decision } = await services.reading.access(
    publication.id,
    number,
    user,
  );
  const page = decision.allowed
    ? await services.publications.page(publication.id, number)
    : null;
  if (decision.allowed && !page) notFound();
  return (
    <section className="reading-room">
      <div className="reading-top">
        <Link href={`/comics/${publication.slug}`} className="text-link">
          <ArrowLeft size={16} />
          <span>{publication.title}</span>
        </Link>
        <span className="tag">
          {number <= 4 ? "Guest preview" : "Protected reading"}
        </span>
      </div>
      <div className="reading-layout">
        <div>
          {decision.allowed && page ? (
            <>
              <img
                className="reading-page"
                src={`/api/comics/${publication.id}/media/${number}`}
                alt={page.alt}
                width={900}
                height={1000}
                fetchPriority="high"
              />
              {user && (
                <ProgressRecorder comicId={publication.id} page={number} />
              )}
            </>
          ) : (
            <div className="gate">
              <LockKeyhole size={30} />
              <h1>The story is just getting started.</h1>
              <p>You’ve reached the end of the four-page preview.</p>
              {decision.reason === "login_required" ? (
                <>
                  <p>
                    Sign in to continue free titles. Premium titles also require
                    the corresponding membership or purchase.
                  </p>
                  <Link
                    className="primary"
                    href={`/login?next=${encodeURIComponent(`/read/${publication.slug}/${number}`)}`}
                  >
                    Sign in to continue
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    {publication.access === "purchase"
                      ? "This comic requires an individual purchase. Membership does not include it."
                      : "This comic requires an active membership or an eligible purchase."}
                  </p>
                  <div className="notice">
                    Payments are coming later. This title cannot be purchased
                    yet.
                  </div>
                  <Link href="/comics?access=free" className="primary">
                    Explore free comics
                  </Link>
                </>
              )}
            </div>
          )}
          <nav className="reader-controls" aria-label="Comic page navigation">
            {number > 1 ? (
              <Link
                className="secondary"
                href={`/read/${publication.slug}/${number - 1}`}
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {number} of {publication.pageCount}
            </span>
            {decision.allowed && number < publication.pageCount ? (
              <Link
                className="primary"
                href={`/read/${publication.slug}/${number + 1}`}
              >
                {number === 4 ? "Continue reading" : "Next page"}
              </Link>
            ) : number === publication.pageCount && decision.allowed ? (
              <Link className="primary" href="/comics">
                Find your next story
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
        <aside className="reading-aside">
          <h2>{publication.title}</h2>
          <p>{publication.synopsis}</p>
          <p>{accessLabels[publication.access]}</p>
          <p>By {publication.authorName}</p>
          <ReportForm comicId={publication.id} authenticated={!!user} />
        </aside>
      </div>
    </section>
  );
}
