import { randomUUID } from "node:crypto";
import type {
  AdministrationRepository,
  CommentRepository,
  ObjectStorage,
  PublicationRepository,
} from "./ports";
import type { ComicPage, Publication, User } from "@/domain/models";
import {
  publicationSchema,
  pageTextSchema,
  type ChapterInput,
  type PublicationInput,
} from "@/domain/validation";
import { ensure } from "@/domain/errors";
import { canManagePublication } from "@/domain/access";
import { chapterRanges, validChapters } from "@/domain/chapters";

// Drafts and changes-requested work can be submitted; owners may also change published work immediately.
const draftStates: Publication["status"][] = ["draft", "changes_requested"];
const editable: Publication["status"][] = [...draftStates, "published"];

// Inserts a page at the end of the given chapter (or the end of the comic) and shifts later chapters.
function insertPage(
  publication: Publication,
  pages: ComicPage[],
  chapterId: string | undefined,
  page: ComicPage,
) {
  const chapters = publication.chapters ?? [];
  const target = chapterId
    ? chapterRanges(publication).find((chapter) => chapter.id === chapterId)
    : undefined;
  if (chapterId && !target) return null;
  const at = target ? target.endPage : pages.length;
  return {
    pages: [...pages.slice(0, at), page, ...pages.slice(at)],
    chapters: chapters.map((chapter) =>
      chapter.startPage > at
        ? { ...chapter, startPage: chapter.startPage + 1 }
        : chapter,
    ),
  };
}
// Removes pages and shifts chapter starts; chapters left with no pages are dropped.
function removePages(
  publication: Publication,
  pages: ComicPage[],
  remove: (page: ComicPage) => boolean,
) {
  const kept = pages.filter((page) => !remove(page));
  if (kept.length === pages.length) return null;
  const removedBefore = (position: number) =>
    pages.filter((page) => page.number < position && remove(page)).length;
  const ranges = chapterRanges(publication);
  const chapters = ranges
    .filter((chapter) =>
      pages.some(
        (page) =>
          page.number >= chapter.startPage &&
          page.number <= chapter.endPage &&
          !remove(page),
      ),
    )
    .map(({ id, title, startPage }) => ({
      id,
      title,
      startPage: startPage - removedBefore(startPage),
    }));
  if (chapters.length) chapters[0] = { ...chapters[0]!, startPage: 1 };
  return { pages: kept, chapters };
}
export class PublicationService {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly storage: ObjectStorage,
    private readonly administration: AdministrationRepository,
    private readonly comments?: CommentRepository,
  ) {}
  async create(actor: User, input: PublicationInput) {
    input = publicationSchema.parse(input);
    ensure(
      actor.status === "active" && ["author", "admin"].includes(actor.role),
      "FORBIDDEN",
      "Publishing requires an authorized author account.",
      403,
    );
    const id = randomUUID();
    const prefix =
      input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70) || "story";
    const publication: Publication = {
      ...input,
      id,
      slug: `${prefix}-${id.slice(0, 8)}`,
      authorId: actor.id,
      authorName: actor.name,
      // Works created by administrators are the platform's own Originals; authors cannot set this.
      original: actor.role === "admin",
      status: "draft",
      coverKey: null,
      pageCount: 0,
      version: 1,
      feedback: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
    };
    await this.publications.create(publication);
    return publication;
  }
  async owned(actor: User, id: string) {
    const publication = await this.publications.find(id);
    ensure(
      publication && canManagePublication(actor, publication),
      "NOT_FOUND",
      "Publication not found.",
      404,
    );
    return publication;
  }
  private audit(
    actor: User,
    action: string,
    targetId: string,
    details: string,
  ) {
    return {
      id: randomUUID(),
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetId,
      details,
      createdAt: new Date(),
    };
  }
  // Changes to a published comic go live immediately, so each one is recorded in the audit log.
  private liveAudit(
    actor: User,
    current: Publication,
    action: string,
    details: string,
  ) {
    return current.status === "published"
      ? this.audit(actor, `publication.${action}`, current.id, details)
      : undefined;
  }
  async edit(
    actor: User,
    id: string,
    version: number,
    input: PublicationInput,
  ) {
    input = publicationSchema.parse(input);
    const current = await this.owned(actor, id);
    ensure(
      current.kind === input.kind,
      "KIND_IMMUTABLE",
      "Create a separate publication to change its type.",
    );
    if (current.status === "published") {
      ensure(
        input.rightsConfirmed,
        "RIGHTS_REQUIRED",
        "Published work must keep its publishing-rights declaration.",
      );
      ensure(
        !["purchase", "both"].includes(input.access) ||
          (input.pricePaise ?? 0) > 0,
        "PRICE_REQUIRED",
        "Set a purchase price for this access option.",
      );
    }
    ensure(
      await this.publications.update(
        id,
        version,
        editable,
        input,
        this.liveAudit(actor, current, "edited", input.title),
      ),
      "CONFLICT",
      "This publication changed or is no longer editable. Reload before saving.",
      409,
    );
  }
  async upload(
    actor: User,
    id: string,
    version: number,
    kind: "cover" | "page",
    data: Uint8Array,
    alt: string,
    chapterId?: string,
  ) {
    const current = await this.owned(actor, id);
    ensure(
      editable.includes(current.status) && current.version === version,
      "CONFLICT",
      "This publication changed or is awaiting review. Reload before uploading.",
      409,
    );
    ensure(
      kind === "cover" || current.kind === "comic",
      "INVALID_UPLOAD",
      "Artwork uses a single cover image.",
    );
    if (kind === "page") this.noPendingRelease(current);
    const key = `publications/${id}/${kind}/${randomUUID()}.webp`;
    await this.storage.put(key, data, "image/webp");
    let committed = false;
    try {
      committed =
        kind === "cover"
          ? await this.publications.update(
              id,
              version,
              editable,
              { coverKey: key },
              this.liveAudit(actor, current, "cover_replaced", alt),
            )
          : await this.publications.restructure(
              id,
              version,
              ({ publication, pages }) =>
                insertPage(publication, pages, chapterId, {
                  id: randomUUID(),
                  comicId: id,
                  number: 0,
                  storageKey: key,
                  alt,
                  bytes: data.byteLength,
                }),
              this.liveAudit(actor, current, "page_added", alt),
            );
      ensure(
        committed,
        "CONFLICT",
        "Another edit was saved first. Reload and try again.",
        409,
      );
    } finally {
      if (!committed)
        await this.storage
          .delete(key)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          );
    }
    // Old covers remain for recovery; the cleanup job described in operations removes unreferenced objects.
  }
  // Page-sequence edits on a published comic wait until a new chapter in preparation is finished or discarded.
  private noPendingRelease(current: Publication) {
    ensure(
      !current.release,
      "RELEASE_PENDING",
      "Finish or discard the new chapter you are preparing before changing this comic's pages.",
      409,
    );
  }
  async replacePage(
    actor: User,
    id: string,
    version: number,
    pageId: string,
    data: Uint8Array,
  ) {
    const current = await this.owned(actor, id);
    ensure(
      current.kind === "comic" &&
        editable.includes(current.status) &&
        current.version === version,
      "CONFLICT",
      "This publication changed or is awaiting review. Reload before replacing a page.",
      409,
    );
    const key = `publications/${id}/page/${randomUUID()}.webp`;
    await this.storage.put(key, data, "image/webp");
    let previous: string | null = null;
    try {
      previous = await this.publications.replacePageImage(
        id,
        version,
        pageId,
        key,
        data.byteLength,
        this.audit(actor, "publication.page_replaced", id, pageId),
      );
      ensure(
        previous,
        "CONFLICT",
        "This page changed or no longer exists. Reload and try again.",
        409,
      );
    } finally {
      await this.storage
        .delete(previous ?? key)
        .catch(() =>
          console.error("storage_cleanup_failed", { publicationId: id }),
        );
    }
  }
  async removePage(actor: User, id: string, version: number, pageId: string) {
    const current = await this.owned(actor, id);
    ensure(current.kind === "comic", "INVALID_KIND", "Only comics have pages.");
    this.noPendingRelease(current);
    const page = (await this.publications.pages(id)).find(
      (item) => item.id === pageId,
    );
    ensure(page, "NOT_FOUND", "Page not found.", 404);
    ensure(
      current.status !== "published" || current.pageCount > 1,
      "LAST_PAGE",
      "A published comic needs at least one page. Delete the comic instead.",
    );
    ensure(
      await this.publications.restructure(
        id,
        version,
        ({ publication, pages }) =>
          removePages(publication, pages, (item) => item.id === pageId),
        this.liveAudit(actor, current, "page_removed", `page ${page.number}`),
      ),
      "CONFLICT",
      "This comic changed. Reload before removing the page.",
      409,
    );
    await this.storage
      .delete(page.storageKey)
      .catch(() =>
        console.error("storage_cleanup_failed", { publicationId: id }),
      );
  }
  async deleteChapter(
    actor: User,
    id: string,
    version: number,
    chapterId: string,
  ) {
    const current = await this.owned(actor, id);
    this.noPendingRelease(current);
    const ranges = chapterRanges(current);
    const chapter = ranges.find((item) => item.id === chapterId);
    ensure(chapter, "NOT_FOUND", "Chapter not found.", 404);
    ensure(
      ranges.length > 1,
      "LAST_CHAPTER",
      "This is the only chapter. Delete the comic instead.",
    );
    const doomed = (await this.publications.pages(id)).filter(
      (page) =>
        page.number >= chapter.startPage && page.number <= chapter.endPage,
    );
    const doomedIds = new Set(doomed.map((page) => page.id));
    ensure(
      await this.publications.restructure(
        id,
        version,
        ({ publication, pages }) => {
          const result = removePages(publication, pages, (page) =>
            doomedIds.has(page.id),
          );
          return (
            result && {
              ...result,
              chapters: result.chapters.filter((item) => item.id !== chapterId),
            }
          );
        },
        this.liveAudit(actor, current, "chapter_deleted", chapter.title),
      ),
      "CONFLICT",
      "This comic changed. Reload before deleting the chapter.",
      409,
    );
    await this.comments
      ?.deleteFor(id, chapterId)
      .catch(() =>
        console.error("comment_cleanup_failed", { publicationId: id }),
      );
    await Promise.all(
      doomed.map((page) =>
        this.storage
          .delete(page.storageKey)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          ),
      ),
    );
  }
  async deleteComic(actor: User, id: string, version: number) {
    const current = await this.owned(actor, id);
    const keys = await this.publications.deletePublication(
      id,
      version,
      this.audit(
        actor,
        "publication.deleted",
        id,
        `${current.title} (${current.status})`,
      ),
    );
    ensure(
      keys,
      "CONFLICT",
      "This publication changed. Reload before deleting it.",
      409,
    );
    await Promise.all(
      keys.map((key) =>
        this.storage
          .delete(key)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          ),
      ),
    );
  }
  async reorder(actor: User, id: string, version: number, ids: string[]) {
    const current = await this.owned(actor, id);
    ensure(
      current.kind === "comic",
      "INVALID_KIND",
      "Only comics have ordered pages.",
    );
    this.noPendingRelease(current);
    ensure(
      await this.publications.reorderPages(id, version, ids),
      "CONFLICT",
      "Pages changed or the order is invalid. Reload before saving.",
      409,
    );
  }
  async editPage(
    actor: User,
    id: string,
    version: number,
    pageId: string,
    alt: string,
    storyText: string,
  ) {
    pageTextSchema.parse({ version, alt, storyText });
    await this.owned(actor, id);
    ensure(
      await this.publications.editPage(id, version, pageId, alt, storyText),
      "CONFLICT",
      "This page changed or is no longer editable. Reload.",
      409,
    );
  }
  async setChapters(
    actor: User,
    id: string,
    version: number,
    input: ChapterInput[],
  ) {
    const current = await this.owned(actor, id);
    ensure(
      current.kind === "comic",
      "INVALID_KIND",
      "Only comics have chapters.",
    );
    ensure(
      editable.includes(current.status) && current.version === version,
      "CONFLICT",
      "This publication changed or is awaiting review. Reload before saving chapters.",
      409,
    );
    const chapters = input.map(({ id, title, startPage }) => ({
      id: id ?? randomUUID(),
      title,
      startPage,
    }));
    ensure(
      validChapters(chapters, current.pageCount),
      "INVALID_CHAPTERS",
      "The first chapter must start on page 1, and each later chapter must start on a later saved page.",
    );
    // The version check also pins pageCount, so the boundaries were validated against the stored pages.
    ensure(
      await this.publications.update(
        id,
        version,
        editable,
        { chapters },
        this.liveAudit(
          actor,
          current,
          "chapters_updated",
          chapters.map((chapter) => chapter.title).join("; "),
        ),
      ),
      "CONFLICT",
      "This publication changed. Reload before saving chapters.",
      409,
    );
  }
  // --- New chapters for published comics ---------------------------------------------------
  private async publishedComic(actor: User, id: string, version: number) {
    const current = await this.owned(actor, id);
    ensure(
      current.kind === "comic" && current.status === "published",
      "NOT_PUBLISHED",
      "New chapters can be added to published comics. Use the draft editor before publication.",
      409,
    );
    ensure(
      current.version === version,
      "CONFLICT",
      "This comic changed. Reload before continuing.",
      409,
    );
    return current;
  }
  private editableRelease(current: Publication) {
    const release = current.release;
    ensure(
      release && ["draft", "changes_requested"].includes(release.status),
      "CONFLICT",
      "This chapter is awaiting review or no longer exists. Reload.",
      409,
    );
    return release;
  }
  private async saveRelease(
    id: string,
    version: number,
    release: Publication["release"],
  ) {
    ensure(
      await this.publications.update(id, version, ["published"], { release }),
      "CONFLICT",
      "This comic changed. Reload before continuing.",
      409,
    );
  }
  async startRelease(actor: User, id: string, version: number, title: string) {
    const current = await this.publishedComic(actor, id, version);
    ensure(
      !current.release,
      "RELEASE_EXISTS",
      "Finish or discard the chapter you are already preparing.",
      409,
    );
    const now = new Date();
    await this.saveRelease(id, version, {
      id: randomUUID(),
      title,
      status: "draft",
      pageCount: 0,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  async renameRelease(actor: User, id: string, version: number, title: string) {
    const current = await this.publishedComic(actor, id, version);
    const release = this.editableRelease(current);
    await this.saveRelease(id, version, {
      ...release,
      title,
      updatedAt: new Date(),
    });
  }
  async uploadReleasePage(
    actor: User,
    id: string,
    version: number,
    data: Uint8Array,
    alt: string,
  ) {
    const current = await this.publishedComic(actor, id, version);
    const release = this.editableRelease(current);
    const key = `publications/${id}/page/${randomUUID()}.webp`;
    await this.storage.put(key, data, "image/webp");
    let committed = false;
    try {
      committed = await this.publications.addReleasePage(current, {
        id: randomUUID(),
        comicId: id,
        number: current.pageCount + release.pageCount + 1,
        storageKey: key,
        alt,
        bytes: data.byteLength,
      });
      ensure(
        committed,
        "CONFLICT",
        "Another edit was saved first. Reload and try again.",
        409,
      );
    } finally {
      if (!committed)
        await this.storage
          .delete(key)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          );
    }
  }
  async submitRelease(actor: User, id: string, version: number) {
    const current = await this.publishedComic(actor, id, version);
    const release = this.editableRelease(current);
    ensure(
      release.pageCount >= 1,
      "PAGES_REQUIRED",
      "Upload at least one page for the new chapter.",
    );
    ensure(
      (await this.administration.policy()).submissionsEnabled,
      "SUBMISSIONS_PAUSED",
      "Submissions are temporarily paused. Your chapter is saved.",
      409,
    );
    await this.saveRelease(id, version, {
      ...release,
      status: "submitted",
      feedback: null,
      updatedAt: new Date(),
    });
  }
  async discardRelease(actor: User, id: string, version: number) {
    const current = await this.publishedComic(actor, id, version);
    ensure(
      current.release,
      "NOT_FOUND",
      "There is no chapter to discard.",
      404,
    );
    const keys = await this.publications.discardRelease(id, version);
    ensure(
      keys,
      "CONFLICT",
      "This comic changed. Reload before discarding.",
      409,
    );
    await Promise.all(
      keys.map((key) =>
        this.storage
          .delete(key)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          ),
      ),
    );
  }
  async submit(actor: User, id: string, version: number) {
    const current = await this.owned(actor, id);
    ensure(
      !["purchase", "both"].includes(current.access) ||
        (current.pricePaise ?? 0) > 0,
      "PRICE_REQUIRED",
      "Set a purchase price before submitting.",
    );
    const policy = await this.administration.policy();
    ensure(
      policy.submissionsEnabled,
      "SUBMISSIONS_PAUSED",
      "Submissions are temporarily paused. Your draft is saved.",
      409,
    );
    ensure(
      current.rightsConfirmed,
      "RIGHTS_REQUIRED",
      "Confirm your publishing rights before submitting.",
    );
    ensure(
      current.coverKey,
      "COVER_REQUIRED",
      "Upload a cover before submitting.",
    );
    ensure(
      current.kind === "artwork" || current.pageCount >= 5,
      "PAGES_REQUIRED",
      "Upload at least five sequential pages before submitting a comic.",
    );
    ensure(
      validChapters(current.chapters ?? [], current.pageCount),
      "INVALID_CHAPTERS",
      "Fix the chapter boundaries before submitting.",
    );
    ensure(
      await this.publications.update(id, version, draftStates, {
        status: "submitted",
        feedback: null,
      }),
      "CONFLICT",
      "This publication changed. Reload before submitting.",
      409,
    );
  }
}
