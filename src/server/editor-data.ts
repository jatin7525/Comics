import type { ComicPage, Publication } from "@/domain/models";
export function editorData(publication: Publication, pages: ComicPage[]) {
  return {
    id: publication.id,
    title: publication.title,
    synopsis: publication.synopsis,
    genre: publication.genre,
    kind: publication.kind,
    access: publication.access,
    ageRating: publication.ageRating,
    rightsConfirmed: publication.rightsConfirmed,
    version: publication.version,
    status: publication.status,
    pageCount: publication.pageCount,
    hasCover: !!publication.coverKey,
    feedback: publication.feedback,
    tags: publication.tags ?? [],
    pricePaise: publication.pricePaise ?? null,
    chapters: (publication.chapters ?? []).map(({ id, title, startPage }) => ({
      id,
      title,
      startPage,
    })),
    release: publication.release
      ? {
          id: publication.release.id,
          title: publication.release.title,
          status: publication.release.status,
          pageCount: publication.release.pageCount,
          feedback: publication.release.feedback,
        }
      : null,
    pages: pages.map(({ id, number, alt, storyText }) => ({
      id,
      number,
      alt,
      storyText: storyText ?? "",
    })),
  };
}
