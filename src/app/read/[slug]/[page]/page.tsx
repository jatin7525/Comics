import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { ReportForm } from "@/components/reader-actions";
import { ReaderScroller } from "@/components/reader-scroller";
import { PREVIEW_PAGES } from "@/domain/access";
import { accessLabels } from "@/components/ui";
import { chapterForPage, chapterRanges } from "@/domain/chapters";

const INITIAL_PAGES = 3;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const { slug, page } = await params;
  const number = Number(page);
  const publication = await getServices().publications.findBySlug(slug);
  if (
    !publication ||
    publication.status !== "published" ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > publication.pageCount
  )
    return { robots: { index: false, follow: false } };
  const preview =
    number <= 4
      ? await getServices().publications.page(publication.id, number)
      : null;
  const chapter = chapterForPage(chapterRanges(publication), number);
  return {
    title: `${publication.title} · ${chapter ? `Chapter ${chapter.number} · ` : ""}Page ${number}`,
    description: (preview?.storyText || publication.synopsis).slice(0, 160),
    robots: { index: number <= 4, follow: true },
  };
}

export default async function Read({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const route = await params,
    number = Number(route.page);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
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
  const batch = await services.reading.pages(
    publication.id,
    number,
    INITIAL_PAGES,
    user,
  );
  return (
    <section className="reading-room">
      <h1 className="sr-only">{publication.title}</h1>
      <div className="reading-top">
        <Link href={`/comics/${publication.slug}`} className="text-link">
          <ArrowLeft size={16} />
          <span>{publication.title}</span>
        </Link>
        <span className="tag">
          {number <= PREVIEW_PAGES ? "Guest preview" : "Protected reading"}
        </span>
      </div>
      <div className="reading-layout">
        <ReaderScroller
          key={`${publication.id}-${number}`}
          comic={{
            id: publication.id,
            slug: publication.slug,
            pageCount: publication.pageCount,
            access: publication.access,
          }}
          chapters={chapterRanges(publication)}
          initial={{
            pages: batch.pages,
            gate: batch.gate,
            gatePage: batch.gatePage,
            nextFrom: batch.nextFrom,
            version: publication.version,
          }}
          authenticated={!!user}
        />
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
