import Link from "next/link";
import type { Metadata } from "next";
import { z } from "zod";
import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { siteName } from "@/server/brand";
import { ComicGrid, Empty, Intro, SectionHeading } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${await siteName()} Originals` };
}

const pageSchema = z.object({
  comics: z.string().max(240).optional(),
  art: z.string().max(240).optional(),
});

export default async function Originals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cursors = pageSchema.safeParse(await searchParams);
  const services = getServices();
  const [name, comics, artwork] = await Promise.all([
    siteName(),
    services.publications.catalog({
      kind: "comic",
      original: true,
      limit: 24,
      cursor: cursors.success ? cursors.data.comics : undefined,
    }),
    services.publications.catalog({
      kind: "artwork",
      original: true,
      limit: 24,
      cursor: cursors.success ? cursors.data.art : undefined,
    }),
  ]);
  return (
    <>
      <Intro
        title={`${name} Originals`}
        description="Our own stories, characters and universe, published alongside the independent creators we support."
      />
      {!comics.items.length && !artwork.items.length ? (
        <Empty
          title="Originals are on the way."
          href="/comics"
          label="Explore comics"
        >
          Our first in-house stories are still being made.
        </Empty>
      ) : (
        <>
          {!!comics.items.length && (
            <section className="section">
              <SectionHeading title="Original comics" />
              <ComicGrid comics={comics.items.map(comicCard)} />
              {comics.nextCursor && (
                <Link
                  className="secondary"
                  href={`/originals?comics=${encodeURIComponent(comics.nextCursor)}`}
                >
                  More original comics
                </Link>
              )}
            </section>
          )}
          {!!artwork.items.length && (
            <section className="section">
              <SectionHeading title="Original artwork" />
              <ComicGrid comics={artwork.items.map(comicCard)} />
              {artwork.nextCursor && (
                <Link
                  className="secondary"
                  href={`/originals?art=${encodeURIComponent(artwork.nextCursor)}`}
                >
                  More original artwork
                </Link>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
