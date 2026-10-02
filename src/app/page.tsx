import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { comicCard } from "@/server/dto";
import { ComicGrid, Empty, Intro, SectionHeading } from "@/components/ui";
import { GenreFilters } from "@/components/genre-filters";

export default async function Discover() {
  const services = getServices();
  const user = await currentUser();
  const [catalog, history, policy, originals] = await Promise.all([
    services.publications.catalog({ limit: 4, kind: "comic" }),
    user ? services.community.library(user.id, true) : Promise.resolve([]),
    services.administration.policy(),
    services.publications.catalog({ limit: 4, kind: "comic", original: true }),
  ]);
  const name = policy.siteName;
  const featured = catalog.items[0];
  return (
    <>
      <Intro
        title="Find your next obsession."
        description="Independent voices. Extraordinary worlds. Stories that stay with you."
        action={
          <span className="date">
            <Sparkles size={18} />A little escape, every day
          </span>
        }
      />
      {featured ? (
        <section className="hero">
          <img
            className="hero-art"
            src={`/api/comics/${featured.id}/cover?v=${featured.version}`}
            alt={`World of ${featured.title}`}
            fetchPriority="high"
          />
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pill">✧ Fresh from the creators</span>
              <span>Original series</span>
            </div>
            <h2>{featured.title}</h2>
            <p>{featured.synopsis}</p>
            <Link className="primary" href={`/read/${featured.slug}/1`}>
              <BookOpen size={17} />
              Start reading
            </Link>
            <Link
              className="secondary"
              href={`/comics/${featured.slug}`}
              aria-label="View story details"
            >
              <ArrowRight size={17} />
            </Link>
            <div className="hero-meta">
              First 4 pages free · No account needed
            </div>
          </div>
          <div className="hero-credit">
            Story & art by {featured.authorName}
          </div>
        </section>
      ) : (
        <Empty title="A new universe is taking shape.">
          Published stories will appear here. Authors can start in their studio.
        </Empty>
      )}
      {history.length > 0 && (
        <section className="continue-section">
          <SectionHeading
            title="Back to your worlds"
            href="/history"
            linkText="Reading history"
          />
          <div className="continue-grid">
            {history.slice(0, 2).map(({ publication, page }) => (
              <Link
                className="continue-card"
                key={publication.id}
                href={`/read/${publication.slug}/${page ?? 1}`}
              >
                <img
                  src={`/api/comics/${publication.id}/cover?v=${publication.version}`}
                  alt=""
                />
                <div>
                  <strong>{publication.title}</strong>
                  <p>
                    Page {page ?? 1} of {publication.pageCount}
                  </p>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${((page ?? 1) / publication.pageCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <GenreFilters />
      <SectionHeading
        title="Stories to get lost in"
        description="New worlds from our independent creators."
        href="/comics"
        linkText="View all comics"
      />
      <ComicGrid comics={catalog.items.map(comicCard)} />
      {!!originals.items.length && (
        <>
          <SectionHeading
            title={`${name} Originals`}
            description="Stories from our own universe, made in-house."
            href="/originals"
            linkText="All originals"
          />
          <ComicGrid comics={originals.items.map(comicCard)} />
        </>
      )}
      {policy.adsEnabled && (
        <div className="ad">
          <div className="ad-symbol">{name.charAt(0).toLowerCase()}.</div>
          <div className="ad-copy">
            <strong>Good stories start with people who care.</strong>
            <p>
              A place for future creative partnerships. No third-party ad
              tracking is active.
            </p>
          </div>
          <span className="ad-label">House promotion</span>
          <Link href="/about" className="secondary">
            Meet {name}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <section className="section">
        <SectionHeading
          title="Beyond the finished page"
          description="Discover the ideas and artwork behind the stories."
          href="/art"
          linkText="Explore artwork"
        />
        <div className="notice">
          Follow creators, save the stories that move you, and come back to your
          next page. Your reading space stays with your account.
        </div>
      </section>
    </>
  );
}
