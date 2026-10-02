import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowLeft } from "lucide-react";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { comicCard } from "@/server/dto";
import { serviceOrigins } from "@/server/service";
import type { Metadata } from "next";
import { accessLabels, BillingNotice, ComicGrid } from "@/components/ui";
import { chapterRanges } from "@/domain/chapters";
import { siteName } from "@/server/brand";
import { PREVIEW_PAGES } from "@/domain/access";
import {
  FollowButton,
  ReportForm,
  SaveButton,
} from "@/components/reader-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getServices().publications.findBySlug(slug);
  if (!publication || publication.status !== "published")
    return {
      title: "Story unavailable",
      robots: { index: false, follow: false },
    };
  const url = `${serviceOrigins().reader}/comics/${publication.slug}`;
  return {
    title: publication.title,
    description: publication.synopsis.slice(0, 160),
    keywords: publication.tags ?? [],
    alternates: { canonical: url },
    openGraph: {
      title: publication.title,
      description: publication.synopsis.slice(0, 160),
      url,
      images: [
        `${serviceOrigins().reader}/api/comics/${publication.id}/cover?v=${publication.version}`,
      ],
    },
  };
}

export default async function ComicDetails({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const services = getServices();
  const publication = await services.publications.findBySlug(slug);
  if (!publication || publication.status !== "published") notFound();
  const [related, name] = await Promise.all([
    services.publications.related(publication),
    siteName(),
  ]);
  const chapters = chapterRanges(publication);
  const user = await currentUser();
  const [saved, following] = user
    ? await Promise.all([
        services.community.isSaved(user.id, publication.id),
        services.community.isFollowing(user.id, publication.authorId),
      ])
    : [false, false];
  return (
    <>
      <Link
        href={publication.kind === "comic" ? "/comics" : "/art"}
        className="text-link back-link"
      >
        <ArrowLeft size={15} />
        Back to the collection
      </Link>
      <section className="detail-layout">
        <div className="detail-cover">
          <img
            src={`/api/comics/${publication.id}/cover?v=${publication.version}`}
            alt={publication.title}
          />
          <span>
            {publication.original
              ? `A ${name.toUpperCase()} ORIGINAL`
              : publication.kind === "comic"
                ? "INDEPENDENT CREATOR COMIC"
                : "ORIGINAL CREATOR ARTWORK"}
          </span>
        </div>
        <div className="detail-copy">
          <div className="detail-tags">
            {publication.original && (
              <Link className="tag original-tag" href="/originals">
                ★ {name} Original
              </Link>
            )}
            <span className="tag">{publication.genre}</span>
            <span className="tag">
              {publication.ageRating === "everyone"
                ? "All ages"
                : publication.ageRating === "teen"
                  ? "Teen · 13+"
                  : "Mature · 18+"}
            </span>
          </div>
          <h1>{publication.title}</h1>
          {!!publication.tags?.length && (
            <div className="detail-tags">
              {publication.tags.map((tag) => (
                <Link
                  className="tag"
                  key={tag}
                  href={`/${publication.kind === "comic" ? "comics" : "art"}?search=${encodeURIComponent(tag)}`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
          {publication.pricePaise &&
          ["purchase", "both"].includes(publication.access) ? (
            <p>
              Individual purchase price: ₹
              {(publication.pricePaise / 100).toFixed(2)} · Checkout coming
              later
            </p>
          ) : null}
          <p className="detail-byline">
            Story & art by{" "}
            <Link href={`/creators/${publication.authorId}`}>
              {publication.authorName}
            </Link>
          </p>
          <p className="synopsis">{publication.synopsis}</p>
          <p className="muted">
            {publication.kind === "comic"
              ? `${chapters.length ? `${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"} · ` : ""}${publication.pageCount} pages · ${accessLabels[publication.access]}`
              : "Publicly viewable original artwork"}
          </p>
          {publication.ageRating === "mature" && (
            <div className="notice">
              Contains mature themes. Intended for readers aged 18 and over.
            </div>
          )}
          <div className="detail-actions">
            {publication.kind === "comic" && (
              <Link href={`/read/${publication.slug}/1`} className="primary">
                <BookOpen size={18} />
                Start reading
              </Link>
            )}
            <SaveButton
              id={publication.id}
              saved={saved}
              authenticated={!!user}
            />
          </div>
          {publication.kind === "comic" && (
            <p className="muted">First 4 pages free. No account needed.</p>
          )}
          <FollowButton
            id={publication.authorId}
            following={following}
            authenticated={!!user}
          />
          <ReportForm comicId={publication.id} authenticated={!!user} />
        </div>
      </section>
      {!!chapters.length && (
        <section className="section">
          <h2>Chapters</h2>
          <p className="muted">
            The first {PREVIEW_PAGES} pages of the comic are a free preview,
            whichever chapter they belong to.
          </p>
          <ol className="chapter-list">
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <Link href={`/read/${publication.slug}/${chapter.startPage}`}>
                  <span className="chapter-number">
                    Chapter {chapter.number}
                  </span>
                  <strong>{chapter.title}</strong>
                  <span className="muted">
                    {chapter.startPage === chapter.endPage
                      ? `Page ${chapter.startPage}`
                      : `Pages ${chapter.startPage}–${chapter.endPage}`}
                    {chapter.endPage <= PREVIEW_PAGES
                      ? " · Free preview"
                      : chapter.startPage <= PREVIEW_PAGES
                        ? " · Includes free preview"
                        : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      {publication.access !== "free" && <BillingNotice />}
      {!!related.length && (
        <section className="section">
          <h2>More stories like this</h2>
          <p className="muted">Explore titles with shared tags and genres.</p>
          <ComicGrid comics={related.map(comicCard)} />
        </section>
      )}
    </>
  );
}
