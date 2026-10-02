import type { Filter } from "mongodb";
import { z } from "zod";
import type { PublicationRepository } from "@/application/ports";
import type {
  AuditEvent,
  CatalogQuery,
  Chapter,
  ComicPage,
  Publication,
} from "@/domain/models";
import { AppError } from "@/domain/errors";
import { database, mongoClient } from "./connection";
import {
  fromDocument,
  toDocument,
  type AuditDoc,
  type PageDoc,
  type PublicationDoc,
} from "./documents";

const cursorSchema = z.object({
  date: z.iso.datetime(),
  id: z.string().uuid(),
});
export class MongoPublications implements PublicationRepository {
  async catalog(query: CatalogQuery) {
    const filter: Filter<PublicationDoc> = {
      status: "published",
      kind: query.kind,
    };
    if (query.genre) filter.genre = query.genre;
    if (query.access) filter.access = query.access;
    if (query.original) filter.original = true;
    if (query.search) filter.$text = { $search: query.search };
    if (query.cursor) {
      try {
        const cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
        );
        filter.$or = [
          { createdAt: { $lt: new Date(cursor.date) } },
          { createdAt: new Date(cursor.date), _id: { $lt: cursor.id } },
        ];
      } catch {
        throw new AppError(
          "INVALID_CURSOR",
          "This catalog page link is invalid. Start from the catalog.",
        );
      }
    }
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .maxTimeMS(3000)
      .toArray();
    const more = docs.length > query.limit;
    const items = docs
      .slice(0, query.limit)
      .map((doc) => fromDocument<Publication>(doc));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        more && last
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
    const doc = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .findOne({ _id: id });
    return doc ? fromDocument<Publication>(doc) : null;
  }
  async findBySlug(slug: string) {
    const doc = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .findOne({ slug });
    return doc ? fromDocument<Publication>(doc) : null;
  }
  async byAuthor(authorId: string) {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find({ authorId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  async create(publication: Publication) {
    await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .insertOne(toDocument(publication));
  }
  async update(
    id: string,
    expectedVersion: number,
    allowedStatuses: Publication["status"][],
    patch: Partial<Publication>,
    audit?: AuditEvent,
  ) {
    const db = await database();
    const client = await mongoClient();
    return client.withSession((session) =>
      session.withTransaction(async () => {
        const result = await db
          .collection<PublicationDoc>("publications")
          .updateOne(
            {
              _id: id,
              version: expectedVersion,
              status: { $in: allowedStatuses },
            },
            { $set: { ...patch, updatedAt: new Date() }, $inc: { version: 1 } },
            { session },
          );
        if (result.modifiedCount !== 1) return false;
        if (audit)
          await db
            .collection<AuditDoc>("audit")
            .insertOne(toDocument(audit), { session });
        return true;
      }),
    );
  }
  async page(comicId: string, number: number) {
    const doc = await (
      await database()
    )
      .collection<PageDoc>("pages")
      .findOne({ comicId, number });
    return doc ? fromDocument<ComicPage>(doc) : null;
  }
  async pages(comicId: string) {
    const docs = await (
      await database()
    )
      .collection<PageDoc>("pages")
      .find({ comicId })
      .sort({ number: 1 })
      .toArray();
    return docs.map((doc) => fromDocument<ComicPage>(doc));
  }
  async pageRange(comicId: string, from: number, to: number) {
    const docs = await (
      await database()
    )
      .collection<PageDoc>("pages")
      .find({ comicId, number: { $gte: from, $lte: to } })
      .sort({ number: 1 })
      .toArray();
    return docs.map((doc) => fromDocument<ComicPage>(doc));
  }
  async related(publication: Publication) {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .aggregate<PublicationDoc>([
        {
          $match: {
            status: "published",
            kind: publication.kind,
            _id: { $ne: publication.id },
            ageRating: publication.ageRating,
            $or: [
              { genre: publication.genre },
              { tags: { $in: publication.tags ?? [] } },
            ],
          },
        },
        {
          $addFields: {
            similarity: {
              $size: {
                $setIntersection: [
                  { $ifNull: ["$tags", []] },
                  publication.tags ?? [],
                ],
              },
            },
          },
        },
        { $sort: { similarity: -1, publishedAt: -1 } },
        { $limit: 4 },
        { $project: { similarity: 0 } },
      ])
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  private async changePages(
    id: string,
    version: number,
    change: (pages: ComicPage[]) => ComicPage[] | null,
  ) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const collection = db.collection<PublicationDoc>("publications");
        const publication = await collection.findOne(
          { _id: id, version, status: { $in: ["draft", "changes_requested"] } },
          { session },
        );
        if (!publication) return false;
        const docs = await db
          .collection<PageDoc>("pages")
          .find({ comicId: id }, { session })
          .sort({ number: 1 })
          .toArray();
        const pages = change(docs.map((doc) => fromDocument<ComicPage>(doc)));
        if (!pages) return false;
        const result = await collection.updateOne(
          { _id: id, version },
          {
            $inc: { version: 1 },
            $set: {
              updatedAt: new Date(),
              previewText: pages
                .slice(0, 4)
                .map((page) => page.storyText ?? "")
                .join("\n"),
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1) return false;
        // Replace inside one transaction to avoid collisions on the unique page-number index.
        await db
          .collection<PageDoc>("pages")
          .deleteMany({ comicId: id }, { session });
        if (pages.length)
          await db
            .collection<PageDoc>("pages")
            .insertMany(pages.map(toDocument), { session });
        return true;
      }),
    );
  }
  async reorderPages(id: string, version: number, ids: string[]) {
    return this.changePages(id, version, (pages) => {
      const byId = new Map(pages.map((page) => [page.id, page]));
      if (
        ids.length !== pages.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !byId.has(id))
      )
        return null;
      return ids.map((id, index) => ({ ...byId.get(id)!, number: index + 1 }));
    });
  }
  async editPage(
    id: string,
    version: number,
    pageId: string,
    alt: string,
    storyText: string,
  ) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications");
        const pages = db.collection<PageDoc>("pages");
        const publication = await publications.findOne(
          { _id: id, version, status: { $in: ["draft", "changes_requested"] } },
          { session },
        );
        const page = await pages.findOne(
          { _id: pageId, comicId: id },
          { session },
        );
        if (!publication || !page) return false;
        await pages.updateOne(
          { _id: pageId, comicId: id },
          { $set: { alt, storyText } },
          { session },
        );
        const preview = await pages
          .find({ comicId: id, number: { $lte: 4 } }, { session })
          .sort({ number: 1 })
          .toArray();
        const result = await publications.updateOne(
          { _id: id, version },
          {
            $inc: { version: 1 },
            $set: {
              updatedAt: new Date(),
              previewText: preview
                .map((page) => page.storyText ?? "")
                .join("\n"),
            },
          },
          { session },
        );
        return result.modifiedCount === 1;
      }),
    );
  }
  async addReleasePage(publication: Publication, page: ComicPage) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const now = new Date();
        const result = await db
          .collection<PublicationDoc>("publications")
          .updateOne(
            {
              _id: publication.id,
              version: publication.version,
              status: "published",
              "release.status": { $in: ["draft", "changes_requested"] },
            },
            {
              $inc: { "release.pageCount": 1, version: 1 },
              $set: { updatedAt: now, "release.updatedAt": now },
            },
            { session },
          );
        if (result.modifiedCount !== 1) return false;
        await db
          .collection<PageDoc>("pages")
          .insertOne(toDocument(page), { session });
        return true;
      }),
    );
  }
  async discardRelease(id: string, version: number) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications");
        const publication = await publications.findOne(
          { _id: id, version, release: { $type: "object" } },
          { session },
        );
        if (!publication) return null;
        const pages = db.collection<PageDoc>("pages");
        const pending = await pages
          .find(
            { comicId: id, number: { $gt: publication.pageCount } },
            { session },
          )
          .toArray();
        await pages.deleteMany(
          { comicId: id, number: { $gt: publication.pageCount } },
          { session },
        );
        await publications.updateOne(
          { _id: id, version },
          {
            $set: { release: null, updatedAt: new Date() },
            $inc: { version: 1 },
          },
          { session },
        );
        return pending.map((page) => page.storageKey);
      }),
    );
  }
  async approveRelease(
    id: string,
    version: number,
    chapters: Chapter[],
    audit: AuditEvent,
  ) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications");
        const publication = await publications.findOne(
          {
            _id: id,
            version,
            status: "published",
            "release.status": "submitted",
          },
          { session },
        );
        if (!publication?.release) return false;
        // Count the stored pages rather than trusting the counter, so readers can never be sent past the last page.
        const stored = await db
          .collection<PageDoc>("pages")
          .countDocuments(
            { comicId: id, number: { $gt: publication.pageCount } },
            { session },
          );
        if (stored !== publication.release.pageCount || stored < 1)
          return false;
        await publications.updateOne(
          { _id: id, version },
          {
            $set: {
              pageCount: publication.pageCount + stored,
              chapters,
              release: null,
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
        return true;
      }),
    );
  }
  async addPage(publication: Publication, page: ComicPage) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const result = await db
          .collection<PublicationDoc>("publications")
          .updateOne(
            {
              _id: publication.id,
              version: publication.version,
              status: { $in: ["draft", "changes_requested"] },
            },
            {
              $inc: { pageCount: 1, version: 1 },
              $set: { updatedAt: new Date() },
            },
            { session },
          );
        if (result.modifiedCount !== 1) return false;
        await db
          .collection<PageDoc>("pages")
          .insertOne(toDocument(page), { session });
        return true;
      }),
    );
  }
}
