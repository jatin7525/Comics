import type { Filter } from "mongodb";
import { z } from "zod";
import type { PublicationRepository } from "@/application/ports";
import type {
  AuditEvent,
  CatalogQuery,
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
      .limit(300)
      .toArray();
    return docs.map((doc) => fromDocument<ComicPage>(doc));
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
              pageCount: { $lt: 300 },
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
