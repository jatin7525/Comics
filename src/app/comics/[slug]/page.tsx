import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowLeft } from "lucide-react";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { comicCard } from "@/server/dto";
import { serviceOrigins } from "@/server/service";
import type { Metadata } from "next";
import { accessLabels, BillingNotice, ComicGrid } from "@/components/ui";
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
      images: [`${serviceOrigins().reader}/api/comics/${publication.id}/cover`],
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
  const related = await services.publications.related(publication);
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
            src={`/api/comics/${publication.id}/cover`}
            alt={publication.title}
          />
          <span>
            {publication.kind === "comic"
              ? "AN ASTRA COMICS ORIGINAL"
              : "ORIGINAL CREATOR ARTWORK"}
          </span>
        </div>
        <div className="detail-copy">
          <div className="detail-tags">
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
              ? `${publication.pageCount} pages · ${accessLabels[publication.access]}`
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
