import type { Filter } from "mongodb";
import { z } from "zod";
import type { CommentRepository } from "@/application/ports";
import type { ChapterComment } from "@/domain/models";
import { AppError } from "@/domain/errors";
import { database } from "./connection";
import { fromDocument, toDocument, type Document } from "./documents";

type CommentDoc = Document<ChapterComment>;
const cursorSchema = z.object({
  date: z.iso.datetime(),
  id: z.string().uuid(),
});
const collection = async () =>
  (await database()).collection<CommentDoc>("comments");

export class MongoComments implements CommentRepository {
  async list(
    comicId: string,
    chapterId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const comments = await collection();
    const thread: Filter<CommentDoc> = { comicId, chapterId };
    const filter: Filter<CommentDoc> = { ...thread };
    if (cursor) {
      try {
        const after = cursorSchema.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
        filter.$or = [
          { createdAt: { $lt: new Date(after.date) } },
          { createdAt: new Date(after.date), _id: { $lt: after.id } },
        ];
      } catch {
        throw new AppError("INVALID_CURSOR", "Reload the comments.");
      }
    }
    const [docs, total] = await Promise.all([
      comments
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .maxTimeMS(3000)
        .toArray(),
      comments.countDocuments(thread, { maxTimeMS: 3000 }),
    ]);
    const items = docs
      .slice(0, limit)
      .map((doc) => fromDocument<ChapterComment>(doc));
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        docs.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                date: last.createdAt.toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  async find(id: string) {
    const doc = await (await collection()).findOne({ _id: id });
    return doc ? fromDocument<ChapterComment>(doc) : null;
  }
  async create(comment: ChapterComment) {
    await (await collection()).insertOne(toDocument(comment));
  }
  async delete(id: string) {
    await (await collection()).deleteOne({ _id: id });
  }
  async deleteFor(comicId: string, chapterId?: string) {
    await (
      await collection()
    ).deleteMany(chapterId ? { comicId, chapterId } : { comicId });
  }
}
