import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import type { PublicationStatus } from "@/domain/models";
import type { ComicCardData } from "@/server/dto";

export const accessLabels = {
  free: "Free with an account",
  membership: "Membership",
  purchase: "Individual purchase",
  both: "Membership or purchase",
};
export function Intro({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="intro">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function SectionHeading({
  title,
  description,
  href,
  linkText = "View all",
}: {
  title: string;
  description?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {linkText}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  href,
  label = "Explore comics",
}: {
  title: string;
  children: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h2>{title}</h2>
      <p>{children}</p>
      {href && (
        <Link href={href} className="primary">
          {label}
        </Link>
      )}
    </div>
  );
}
export function Stats({
  values,
}: {
  values: { label: string; value: string | number; detail: string }[];
}) {
  return (
    <div className="stats">
      {values.map((item) => (
        <div className="stat" key={item.label}>
          <p>{item.label}</p>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </div>
  );
}
const statusLabels: Record<PublicationStatus, string> = {
  draft: "Draft",
  submitted: "Pending review",
  changes_requested: "Changes requested",
  published: "Published",
  rejected: "Rejected",
  hidden: "Hidden",
};
export function Status({ value }: { value: PublicationStatus }) {
  return (
    <span
      className={`status ${value === "published" ? "green" : value === "submitted" || value === "changes_requested" ? "amber" : value === "rejected" || value === "hidden" ? "red" : "grey"}`}
    >
      {statusLabels[value]}
    </span>
  );
}
export function ComicCard({ comic }: { comic: ComicCardData }) {
  return (
    <article className="comic-card">
      <Link
        className="cover"
        href={`/comics/${comic.slug}`}
        aria-label={`Explore ${comic.title}`}
      >
        <img
          loading="lazy"
          src={
            comic.hasCover
              ? `/api/comics/${comic.id}/cover?v=${comic.version}`
              : "/art/neon.svg"
          }
          alt={`Cover of ${comic.title}`}
          width={900}
          height={1000}
        />
        <span className={`badge ${comic.access === "free" ? "" : "premium"}`}>
          {comic.access === "free"
            ? "Free to read"
            : comic.access === "purchase"
              ? "Purchase title"
              : "✧ Premium"}
        </span>
        <span className="cover-title">
          <small>
            {comic.original
              ? "★ ORIGINAL"
              : `BY ${comic.authorName.toUpperCase()}`}
          </small>
          {comic.title}
        </span>
      </Link>
      <div className="card-title-row">
        <h3>
          <Link href={`/comics/${comic.slug}`}>{comic.title}</Link>
        </h3>
      </div>
      <p className="author">
        <Link href={`/creators/${comic.authorId}`}>{comic.authorName}</Link>
      </p>
      <div className="card-meta">
        <span className="tag">{comic.genre}</span>
        <span>
          {comic.kind === "artwork"
            ? "Original artwork"
            : comic.chapterCount > 1
              ? `${comic.chapterCount} chapters · ${comic.pageCount} pages`
              : `${comic.pageCount} pages`}
        </span>
        <span className="access-caption">{accessLabels[comic.access]}</span>
      </div>
    </article>
  );
}
export function ComicGrid({ comics }: { comics: ComicCardData[] }) {
  return (
    <div className="grid">
      {comics.map((comic) => (
        <ComicCard key={comic.id} comic={comic} />
      ))}
    </div>
  );
}
export function BillingNotice() {
  return (
    <div className="notice">
      <strong>Payments are not available yet.</strong>
      <br />
      Premium titles are visible and include a four-page preview. No payment
      details are collected. Memberships and purchases will be introduced after
      billing is implemented.
    </div>
  );
}
