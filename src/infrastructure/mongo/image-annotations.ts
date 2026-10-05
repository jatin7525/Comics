import { MongoServerError } from "mongodb";
import type { AnnotationRepository } from "@/application/mcp/annotation-port";
import type { ImageAnnotation } from "@/domain/mcp/annotations";
import type { AuditEvent } from "@/domain/models";
import { database, mongoClient } from "./connection";
import { fromDocument, toDocument } from "./documents";
type Doc = Omit<ImageAnnotation, "id"> & { _id: string };
export class MongoImageAnnotations implements AnnotationRepository {
  async find(pageId: string) {
    const d = await (
      await database()
    )
      .collection<Doc>("imageAnnotations")
      .findOne({ _id: pageId });
    return d ? fromDocument<ImageAnnotation>(d) : null;
  }
  async save(
    annotation: ImageAnnotation,
    expectedVersion: number,
    audit: AuditEvent,
  ) {
    const db = await database();
    try {
      return !!(await (
        await mongoClient()
      ).withSession((session) =>
        session.withTransaction(async () => {
          const collection = db.collection<Doc>("imageAnnotations");
          if (expectedVersion === 0)
            await collection.insertOne(toDocument(annotation), { session });
          else {
            const result = await collection.replaceOne(
              { _id: annotation.id, version: expectedVersion },
              toDocument(annotation),
              { session },
            );
            if (!result.modifiedCount) return false;
          }
          await db
            .collection<Omit<AuditEvent, "id"> & { _id: string }>("audit")
            .insertOne(toDocument(audit), { session });
          return true;
        }),
      ));
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        return false;
      throw error;
    }
  }
  async search(query: {
    comicIds: string[];
    character?: string;
    tag?: string;
    cursor?: string;
    limit: number;
  }) {
    const docs = await (
      await database()
    )
      .collection<Doc>("imageAnnotations")
      .find({
        comicId: { $in: query.comicIds },
        ...(query.character ? { characters: query.character } : {}),
        ...(query.tag ? { tags: query.tag } : {}),
        ...(query.cursor ? { _id: { $gt: query.cursor } } : {}),
      })
      .sort({ _id: 1 })
      .limit(query.limit)
      .maxTimeMS(3000)
      .toArray();
    return docs.map((d) => fromDocument<ImageAnnotation>(d));
  }
}
