import type { CommunityRepository } from "@/application/ports";
import type { LibraryItem, Publication, ReaderReport } from "@/domain/models";
import { database } from "./connection";
import {
  fromDocument,
  toDocument,
  type PublicationDoc,
  type ReportDoc,
} from "./documents";

interface ReaderLink {
  userId: string;
  comicId: string;
  updatedAt: Date;
  page?: number;
}
interface Follow {
  userId: string;
  authorId: string;
  updatedAt: Date;
}
export class MongoCommunity implements CommunityRepository {
  async library(userId: string, history: boolean): Promise<LibraryItem[]> {
    const db = await database();
    const links = await db
      .collection<ReaderLink>(history ? "progress" : "saved")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(48)
      .toArray();
    if (!links.length) return [];
    const docs = await db
      .collection<PublicationDoc>("publications")
      .find({
        _id: { $in: links.map((link) => link.comicId) },
        status: "published",
      })
      .toArray();
    const byId = new Map(
      docs.map((doc) => [doc._id, fromDocument<Publication>(doc)]),
    );
    return links.flatMap((link) => {
      const publication = byId.get(link.comicId);
      return publication
        ? [{ publication, page: link.page ?? null, saved: !history }]
        : [];
    });
  }
  async isSaved(userId: string, comicId: string) {
    return !!(await (
      await database()
    )
      .collection("saved")
      .findOne({ userId, comicId }));
  }
  async save(userId: string, comicId: string, enabled: boolean) {
    const collection = (await database()).collection<ReaderLink>("saved");
    if (enabled)
      await collection.updateOne(
        { userId, comicId },
        { $set: { updatedAt: new Date() } },
        { upsert: true },
      );
    else await collection.deleteOne({ userId, comicId });
  }
  async recordProgress(userId: string, comicId: string, page: number) {
    await (
      await database()
    )
      .collection<ReaderLink>("progress")
      .updateOne(
        { userId, comicId },
        { $set: { page, updatedAt: new Date() } },
        { upsert: true },
      );
  }
  async follow(userId: string, authorId: string, enabled: boolean) {
    const collection = (await database()).collection<Follow>("follows");
    if (enabled)
      await collection.updateOne(
        { userId, authorId },
        { $set: { updatedAt: new Date() } },
        { upsert: true },
      );
    else await collection.deleteOne({ userId, authorId });
  }
  async isFollowing(userId: string, authorId: string) {
    return !!(await (
      await database()
    )
      .collection("follows")
      .findOne({ userId, authorId }));
  }
  async feed(userId: string) {
    // Bounded join at the database avoids one query per followed author.
    const docs = await (
      await database()
    )
      .collection<Follow>("follows")
      .aggregate<PublicationDoc>(
        [
          { $match: { userId } },
          { $sort: { updatedAt: -1 } },
          { $limit: 100 },
          {
            $lookup: {
              from: "publications",
              localField: "authorId",
              foreignField: "authorId",
              pipeline: [
                { $match: { status: "published" } },
                { $sort: { publishedAt: -1 } },
                { $limit: 3 },
              ],
              as: "stories",
            },
          },
          { $unwind: "$stories" },
          { $replaceRoot: { newRoot: "$stories" } },
          { $sort: { publishedAt: -1 } },
          { $limit: 12 },
        ],
        { maxTimeMS: 3000 },
      )
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  async report(report: ReaderReport) {
    await (
      await database()
    )
      .collection<ReportDoc>("reports")
      .insertOne(toDocument(report));
  }
  async metrics(authorId?: string) {
    const db = await database();
    const filter = authorId ? { authorId } : {};
    const grouped = await db
      .collection<PublicationDoc>("publications")
      .aggregate<{ _id: string; count: number }>(
        [
          { $match: filter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        { maxTimeMS: 3000 },
      )
      .toArray();
    const counts = new Map(grouped.map((row) => [row._id, row.count]));
    // Join each progress record to at most one publication; never build an array of all readers on a comic.
    const readership = await db
      .collection<ReaderLink>("progress")
      .aggregate<{ count: number }>(
        [
          ...(authorId
            ? [
                {
                  $lookup: {
                    from: "publications",
                    localField: "comicId",
                    foreignField: "_id",
                    pipeline: [
                      { $match: { authorId } },
                      { $project: { _id: 1 } },
                    ],
                    as: "publication",
                  },
                },
                { $match: { "publication.0": { $exists: true } } },
              ]
            : []),
          { $group: { _id: "$userId" } },
          { $count: "count" },
        ],
        { maxTimeMS: 3000, allowDiskUse: true },
      )
      .toArray();
    const followers = await db
      .collection("follows")
      .countDocuments(authorId ? { authorId } : {}, { maxTimeMS: 3000 });
    return {
      published: counts.get("published") ?? 0,
      drafts:
        (counts.get("draft") ?? 0) + (counts.get("changes_requested") ?? 0),
      submitted: counts.get("submitted") ?? 0,
      readers: readership[0]?.count ?? 0,
      followers,
    };
  }
}
