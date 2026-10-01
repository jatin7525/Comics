import type { Publication } from "@/domain/models";

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
    hasCover: !!publication.coverKey,
  };
}
export type ComicCardData = ReturnType<typeof comicCard>;
