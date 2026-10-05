import type { Publication } from "@/domain/models";
import { chapterRanges } from "@/domain/chapters";

// Explicit allowlist: storage keys, review notes and internal fields never enter public DTOs.
export function comicCard(publication: Publication) {
  return {
    id: publication.id,
    slug: publication.slug,
    title: publication.title,
    authorId: publication.authorId,
    authorName: publication.authorName,
    synopsis: publication.synopsis,
    genre: publication.genre,
    access: publication.access,
    kind: publication.kind,
    ageRating: publication.ageRating,
    pageCount: publication.pageCount,
    original: !!publication.original,
    chapterCount: chapterRanges(publication).length,
    tags: publication.tags ?? [],
    pricePaise: publication.pricePaise ?? null,
    hasCover: !!publication.coverKey,
    // Lets cover URLs change whenever the publication does, so cached covers never go stale.
    version: publication.version,
  };
}
export type ComicCardData = ReturnType<typeof comicCard>;
