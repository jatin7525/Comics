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
import { validChapters } from "@/domain/chapters";
import { database, mongoClient } from "./connection";
import {
  fromDocument,
  toDocument,
  type AuditDoc,
  type PageDoc,
  type PublicationDoc,
} from "./documents";

// Owners may change these immediately; submitted (in review) and hidden comics stay locked.
const editableStatuses: Publication["status"][] = [
  "draft",
  "changes_requested",
  "published",
];
const cursorSchema = z.object({
  date: z.iso.datetime(),
  id: z.string().uuid(),
});
export class MongoPublications implements PublicationRepository {
  async mcpSelectable(ids: string[]) {
    return (
      await (
        await database()
      )
        .collection<PublicationDoc>("publications")
        .find(
          { _id: { $in: ids }, original: true, kind: "comic" },
          { projection: { _id: 1 } },
        )
        .limit(500)
        .maxTimeMS(3000)
        .toArray()
    ).map((doc) => doc._id);
  }
  async mcpCatalog(
    ids: string[],
    query: { cursor?: string; limit: number; search?: string; genre?: string },
    preview: boolean,
  ) {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find({
        kind: "comic",
        original: true,
        _id: { $in: ids, ...(query.cursor ? { $gt: query.cursor } : {}) },
        ...(preview ? {} : { status: "published" }),
        ...(query.search ? { $text: { $search: query.search } } : {}),
        ...(query.genre ? { genre: query.genre as Publication["genre"] } : {}),
      })
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .maxTimeMS(3000)
      .toArray();
    return {
      items: docs
        .slice(0, query.limit)
        .map((doc) => fromDocument<Publication>(doc)),
      nextCursor: docs.length > query.limit ? docs[query.limit - 1]!._id : null,
    };
  }
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
  async pageById(comicId: string, id: string) {
    const doc = await (
      await database()
    )
      .collection<PageDoc>("pages")
      .findOne({ _id: id, comicId });
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
  // Structural page edits rewrite the page sequence, chapters and preview text in one transaction.
  // Allowed on drafts, and on published comics that have no new chapter in preparation.
  async restructure(
    id: string,
    version: number,
    change: (current: {
      publication: Publication;
      pages: ComicPage[];
    }) => { pages: ComicPage[]; chapters: Chapter[] } | null,
    audit?: AuditEvent,
  ) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const collection = db.collection<PublicationDoc>("publications");
        const doc = await collection.findOne(
          {
            _id: id,
            version,
            $or: [
              { status: { $in: ["draft", "changes_requested"] } },
              { status: "published", release: null },
            ],
          },
          { session },
        );
        if (!doc) return false;
        const docs = await db
          .collection<PageDoc>("pages")
          .find({ comicId: id }, { session })
          .sort({ number: 1 })
          .toArray();
        const next = change({
          publication: fromDocument<Publication>(doc),
          pages: docs.map((page) => fromDocument<ComicPage>(page)),
        });
        if (!next || !validChapters(next.chapters, next.pages.length))
          return false;
        const pages = next.pages.map((page, index) => ({
          ...page,
          number: index + 1,
        }));
        const result = await collection.updateOne(
          { _id: id, version },
          {
            $inc: { version: 1 },
            $set: {
              updatedAt: new Date(),
              pageCount: pages.length,
              chapters: next.chapters,
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
        if (audit)
          await db
            .collection<AuditDoc>("audit")
            .insertOne(toDocument(audit), { session });
        return true;
      }),
    );
  }
  async reorderPages(id: string, version: number, ids: string[]) {
    return this.restructure(id, version, ({ publication, pages }) => {
      const byId = new Map(pages.map((page) => [page.id, page]));
      if (
        ids.length !== pages.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !byId.has(id))
      )
        return null;
      return {
        pages: ids.map((id) => byId.get(id)!),
        chapters: publication.chapters ?? [],
      };
    });
  }
  async replacePageImage(
    id: string,
    version: number,
    pageId: string,
    storageKey: string,
    bytes: number,
    audit: AuditEvent,
  ) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications");
        const pages = db.collection<PageDoc>("pages");
        const publication = await publications.findOne(
          { _id: id, version, status: { $in: editableStatuses } },
          { session },
        );
        const page = await pages.findOne(
          { _id: pageId, comicId: id },
          { session },
        );
        if (
          !publication ||
          !page ||
          (page.number > publication.pageCount &&
            (!publication.release ||
              !["draft", "changes_requested"].includes(
                publication.release.status,
              ) ||
              page.number >
                publication.pageCount + publication.release.pageCount))
        )
          return null;
        await pages.updateOne(
          { _id: pageId, comicId: id },
          { $set: { storageKey, bytes } },
          { session },
        );
        await publications.updateOne(
          { _id: id, version },
          { $inc: { version: 1 }, $set: { updatedAt: new Date() } },
          { session },
        );
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
        return page.storageKey;
      }),
    );
  }
  async deletePublication(id: string, version: number, audit: AuditEvent) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications");
        const publication = await publications.findOne(
          { _id: id, version },
          { session },
        );
        if (!publication) return null;
        const pages = await db
          .collection<PageDoc>("pages")
          .find({ comicId: id }, { session })
          .toArray();
        await db
          .collection<PageDoc>("pages")
          .deleteMany({ comicId: id }, { session });
        for (const name of [
          "saved",
          "progress",
          "comments",
          "imageAnnotations",
        ])
          await db.collection(name).deleteMany({ comicId: id }, { session });
        await publications.deleteOne({ _id: id, version }, { session });
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
        return [
          ...pages.map((page) => page.storageKey),
          ...(publication.coverKey ? [publication.coverKey] : []),
        ];
      }),
    );
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
          { _id: id, version, status: { $in: editableStatuses } },
          { session },
        );
        const page = await pages.findOne(
          { _id: pageId, comicId: id },
          { session },
        );
        if (
          !publication ||
          !page ||
          (page.number > publication.pageCount &&
            (!publication.release ||
              !["draft", "changes_requested"].includes(
                publication.release.status,
              ) ||
              page.number >
                publication.pageCount + publication.release.pageCount))
        )
          return false;
        await pages.updateOne(
          { _id: pageId, comicId: id },
          { $set: { alt, storyText } },
          { session },
        );
        const preview = await pages
          .find(
            {
              comicId: id,
              number: { $lte: Math.min(4, publication.pageCount) },
            },
            { session },
          )
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
  async orderReleasePages(
    id: string,
    version: number,
    ids: string[],
    removedPageId?: string,
  ) {
    const db = await database();
    return !!(await (
      await mongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        const publications = db.collection<PublicationDoc>("publications"),
          pages = db.collection<PageDoc>("pages");
        const pub = await publications.findOne(
          {
            _id: id,
            version,
            status: "published",
            "release.status": { $in: ["draft", "changes_requested"] },
          },
          { session },
        );
        if (!pub?.release) return false;
        const stored = await pages
          .find({ comicId: id, number: { $gt: pub.pageCount } }, { session })
          .toArray();
        const available = new Map(
          stored.filter((p) => p._id !== removedPageId).map((p) => [p._id, p]),
        );
        if (
          stored.length !== pub.release.pageCount ||
          (removedPageId && !stored.some((p) => p._id === removedPageId)) ||
          ids.length !== available.size ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !available.has(id))
        )
          return false;
        await pages.deleteMany(
          { comicId: id, number: { $gt: pub.pageCount } },
          { session },
        );
        if (ids.length)
          await pages.insertMany(
            ids.map((id, index) => ({
              ...available.get(id)!,
              number: pub.pageCount + index + 1,
            })),
            { session },
          );
        await publications.updateOne(
          { _id: id, version },
          {
            $inc: { version: 1 },
            $set: {
              "release.pageCount": ids.length,
              "release.updatedAt": new Date(),
              updatedAt: new Date(),
            },
          },
          { session },
        );
        return true;
      }),
    ));
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
