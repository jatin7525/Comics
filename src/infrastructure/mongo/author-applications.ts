import type { AuthorApplicationRepository } from "@/application/author-application-service";
import type {
  AuthorApplication,
  ApplicationReview,
} from "@/domain/author-application";
import type { AuditEvent } from "@/domain/models";
import { database, mongoClient } from "./connection";
import {
  fromDocument,
  toDocument,
  type Document,
  type AccountDoc,
  type AuditDoc,
  type SessionDoc,
} from "./documents";
type ApplicationDoc = Document<AuthorApplication>;
export class MongoAuthorApplications implements AuthorApplicationRepository {
  async mine(userId: string) {
    const doc = await (
      await database()
    )
      .collection<ApplicationDoc>("authorApplications")
      .findOne({ userId });
    return doc ? fromDocument<AuthorApplication>(doc) : null;
  }
  async find(id: string) {
    const doc = await (
      await database()
    )
      .collection<ApplicationDoc>("authorApplications")
      .findOne({ _id: id });
    return doc ? fromDocument<AuthorApplication>(doc) : null;
  }
  async queue() {
    const docs = await (
      await database()
    )
      .collection<ApplicationDoc>("authorApplications")
      .find({ status: "submitted" })
      .sort({ updatedAt: 1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<AuthorApplication>(doc));
  }
  async create(application: AuthorApplication) {
    const collection = (await database()).collection<ApplicationDoc>(
      "authorApplications",
    );
    // Unique user index ensures concurrent requests cannot create multiple applications.
    try {
      await collection.updateOne(
        { userId: application.userId },
        { $setOnInsert: toDocument(application) },
        { upsert: true },
      );
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === 11000))
        throw error;
    }
    return (await this.mine(application.userId))!;
  }
  async update(id: string, version: number, patch: Partial<AuthorApplication>) {
    const result = await (
      await database()
    )
      .collection<ApplicationDoc>("authorApplications")
      .updateOne(
        {
          _id: id,
          version,
          status: { $in: ["draft", "changes_requested", "rejected"] },
        },
        { $set: { ...patch, updatedAt: new Date() }, $inc: { version: 1 } },
      );
    return result.modifiedCount === 1;
  }
  async review(id: string, input: ApplicationReview, audit: AuditEvent) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const applications =
          db.collection<ApplicationDoc>("authorApplications");
        const application = await applications.findOne(
          { _id: id, version: input.version, status: "submitted" },
          { session },
        );
        if (!application) return false;
        const account = await db
          .collection<AccountDoc>("accounts")
          .findOne(
            { _id: application.userId, role: "reader", status: "active" },
            { session },
          );
        if (!account) return false;
        if (input.decision === "approved") {
          await db
            .collection<AccountDoc>("accounts")
            .updateOne(
              { _id: account._id, role: "reader", status: "active" },
              { $set: { role: "author" } },
              { session },
            );
          await db
            .collection<SessionDoc>("sessions")
            .deleteMany({ userId: account._id }, { session });
        }
        await applications.updateOne(
          { _id: id, version: input.version },
          {
            $set: {
              status: input.decision,
              feedback: input.note,
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
}
