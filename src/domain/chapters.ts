import type { Chapter, Publication } from "./models";

export const MAX_CHAPTERS = 200;

export interface ChapterRange extends Chapter {
  number: number;
  endPage: number;
}

// Chapters are boundaries in the comic's single page sequence: each starts at a
// page position and runs until the next chapter begins. No chapter may be empty.
export function validChapters(
  chapters: Pick<Chapter, "id" | "startPage">[],
  pageCount: number,
): boolean {
  if (!chapters.length) return true;
  if (chapters[0]!.startPage !== 1) return false;
  if (new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length)
    return false;
  return chapters.every(
    (chapter, index) =>
      Number.isSafeInteger(chapter.startPage) &&
      chapter.startPage <= pageCount &&
      (index === 0 || chapter.startPage > chapters[index - 1]!.startPage),
  );
}
export function chapterRanges(
  publication: Pick<Publication, "chapters" | "pageCount" | "kind">,
): ChapterRange[] {
  const chapters = publication.chapters ?? [];
  if (
    publication.kind !== "comic" ||
    !validChapters(chapters, publication.pageCount)
  )
    return [];
  return chapters.map((chapter, index) => ({
    ...chapter,
    number: index + 1,
    endPage: (chapters[index + 1]?.startPage ?? publication.pageCount + 1) - 1,
  }));
}
export function chapterForPage(ranges: ChapterRange[], page: number) {
  return ranges.find(
    (chapter) => page >= chapter.startPage && page <= chapter.endPage,
  );
}
