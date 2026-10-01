import Link from "next/link";
export default function NotFound() {
  return (
    <section className="empty">
      <h1>This page has left the story.</h1>
      <p>
        The link may be incorrect, or the publication is no longer available.
      </p>
      <Link className="primary" href="/comics">
        Explore the catalog
      </Link>
    </section>
  );
}
