import Link from "next/link";
import type { Publication } from "@/domain/models";

// Chapters submitted for already-published comics, linked to their review page.
export function ReleaseQueue({ releases }: { releases: Publication[] }) {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>New chapters awaiting review</h2>
      </div>
      {releases.length ? (
        <ul className="release-queue">
          {releases.map((publication) => (
            <li key={publication.id}>
              <Link href={`/admin/reviews/${publication.id}`}>
                {publication.title}: {publication.release?.title}
              </Link>{" "}
              <span className="muted">
                {publication.release?.pageCount} new pages · by{" "}
                {publication.authorName}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No new chapters are waiting.</p>
      )}
    </section>
  );
}
