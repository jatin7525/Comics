import { randomUUID } from "node:crypto";
import type {
  CommentRepository,
  EntitlementRepository,
  PublicationRepository,
} from "./ports";
import type { ChapterComment, Publication, User } from "@/domain/models";
import { chapterRanges } from "@/domain/chapters";
import { readingAccess } from "@/domain/access";
import { ensure } from "@/domain/errors";
import { WHOLE_COMIC_THREAD } from "@/domain/validation";

const PAGE_SIZE = 20;

export class CommentService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly publications: PublicationRepository,
    private readonly entitlements: EntitlementRepository,
  ) {}
  // Resolves the thread to its first page; comics without chapters have one thread starting on page 1.
  private async thread(comicId: string, chapterId: string) {
    const publication = await this.publications.find(comicId);
    ensure(
      publication &&
        publication.status === "published" &&
        publication.kind === "comic",
      "NOT_FOUND",
      "This comic is not available.",
      404,
    );
    const ranges = chapterRanges(publication);
    const startPage = ranges.length
      ? ranges.find((chapter) => chapter.id === chapterId)?.startPage
      : chapterId === WHOLE_COMIC_THREAD
        ? 1
        : undefined;
    ensure(startPage, "NOT_FOUND", "Chapter not found.", 404);
    return { publication, startPage };
  }
  private canModerate(user: User | null, publication: Publication) {
    return (
      !!user &&
      user.status === "active" &&
      (user.role === "admin" || user.id === publication.authorId)
    );
  }
  async list(
    comicId: string,
    chapterId: string,
    cursor: string | undefined,
    user: User | null,
  ) {
    const { publication } = await this.thread(comicId, chapterId);
    const slice = await this.comments.list(
      comicId,
      chapterId,
      cursor,
      PAGE_SIZE,
    );
    const moderator = this.canModerate(user, publication);
    return {
      total: slice.total,
      nextCursor: slice.nextCursor,
      items: slice.items.map((comment) => ({
        id: comment.id,
        userName: comment.userName,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        mine: comment.userId === user?.id,
        canDelete: moderator || comment.userId === user?.id,
        byAuthor: comment.userId === publication.authorId,
      })),
    };
  }
  async post(user: User, comicId: string, chapterId: string, body: string) {
    const { publication, startPage } = await this.thread(comicId, chapterId);
    // Only readers who can open the chapter may discuss it.
    const grants =
      publication.access !== "free"
        ? await this.entitlements.forReader(user.id, comicId)
        : [];
    const decision = readingAccess(publication, startPage, user, grants);
    ensure(
      decision.allowed || this.canModerate(user, publication),
      "FORBIDDEN",
      "You can comment once you can read this chapter.",
      403,
    );
    const comment: ChapterComment = {
      id: randomUUID(),
      comicId,
      chapterId,
      userId: user.id,
      userName: user.name,
      body,
      createdAt: new Date(),
    };
    await this.comments.create(comment);
    return comment;
  }
  async remove(user: User, comicId: string, commentId: string) {
    const comment = await this.comments.find(commentId);
    ensure(
      comment && comment.comicId === comicId,
      "NOT_FOUND",
      "Comment not found.",
      404,
    );
    const publication = await this.publications.find(comicId);
    ensure(
      comment.userId === user.id ||
        (publication && this.canModerate(user, publication)),
      "FORBIDDEN",
      "You can only delete your own comments.",
      403,
    );
    await this.comments.delete(commentId);
  }
}
