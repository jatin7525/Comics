import type { AdministrationRepository } from "@/application/ports";
import type {
  AuditEvent,
  PlatformPolicy,
  Publication,
  ReaderReport,
  User,
} from "@/domain/models";
import { database, mongoClient } from "./connection";
import {
  fromDocument,
  toDocument,
  type AccountDoc,
  type AuditDoc,
  type PolicyDoc,
  type PublicationDoc,
  type ReportDoc,
  type SessionDoc,
} from "./documents";
import { ensure } from "@/domain/errors";
import { DEFAULT_SITE_NAME } from "@/domain/brand";

function fallbackSiteName() {
  return process.env.SITE_NAME?.trim() || DEFAULT_SITE_NAME;
}
export class MongoAdministration implements AdministrationRepository {
  async reviewQueue() {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find({ status: "submitted" })
      .sort({ updatedAt: 1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  async releaseQueue() {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find({ status: "published", "release.status": "submitted" })
      .sort({ updatedAt: 1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  async content() {
    const docs = await (
      await database()
    )
      .collection<PublicationDoc>("publications")
      .find({})
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<Publication>(doc));
  }
  async users(): Promise<User[]> {
    const docs = await (
      await database()
    )
      .collection<AccountDoc>("accounts")
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => ({
      id: doc._id,
      name: doc.name,
      email: doc.email,
      role: doc.role,
      status: doc.status,
      createdAt: doc.createdAt,
    }));
  }
  async audit() {
    const docs = await (
      await database()
    )
      .collection<AuditDoc>("audit")
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return docs.map((doc) => fromDocument<AuditEvent>(doc));
  }
  async reports() {
    const docs = await (
      await database()
    )
      .collection<ReportDoc>("reports")
      .find({ status: "open" })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return docs.map((doc) => fromDocument<ReaderReport>(doc));
  }
  async policy(): Promise<PlatformPolicy> {
    const doc = await (
      await database()
    )
      .collection<PolicyDoc>("policies")
      .findOne({ _id: "platform" });
    return doc
      ? {
          id: "platform",
          adsEnabled: doc.adsEnabled,
          submissionsEnabled: doc.submissionsEnabled,
          siteName: doc.siteName || fallbackSiteName(),
          updatedAt: doc.updatedAt,
        }
      : {
          id: "platform",
          adsEnabled: true,
          submissionsEnabled: true,
          siteName: fallbackSiteName(),
          updatedAt: new Date(0),
        };
  }
  async updatePolicy(
    patch: Pick<PlatformPolicy, "adsEnabled" | "submissionsEnabled"> &
      Partial<Pick<PlatformPolicy, "siteName">>,
    audit: AuditEvent,
  ) {
    const db = await database();
    await (
      await mongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        await db
          .collection<PolicyDoc>("policies")
          .updateOne(
            { _id: "platform" },
            { $set: { ...patch, updatedAt: new Date() } },
            { upsert: true, session },
          );
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
      }),
    );
  }
  async updateUser(
    id: string,
    patch: Pick<User, "role" | "status">,
    audit: AuditEvent,
  ) {
    const db = await database();
    await (
      await mongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        const current = await db
          .collection<AccountDoc>("accounts")
          .findOne({ _id: id }, { session });
        if (patch.role === "author" && current?.role === "reader") {
          const approved = await db
            .collection("authorApplications")
            .findOne({ userId: id, status: "approved" }, { session });
          ensure(
            approved,
            "APPLICATION_REQUIRED",
            "Review and approve this reader’s author application before granting publishing access.",
            409,
          );
        }
        const result = await db
          .collection<AccountDoc>("accounts")
          .updateOne(
            { _id: id, role: { $ne: "admin" } },
            { $set: patch },
            { session },
          );
        ensure(
          result.matchedCount === 1,
          "ACCOUNT_PROTECTED",
          "Admin accounts cannot be changed from this screen.",
          409,
        );
        await db
          .collection<SessionDoc>("sessions")
          .deleteMany({ userId: id }, { session });
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
      }),
    );
  }
  async resolveReport(id: string, audit: AuditEvent) {
    const db = await database();
    return (await mongoClient()).withSession((session) =>
      session.withTransaction(async () => {
        const result = await db
          .collection<ReportDoc>("reports")
          .updateOne(
            { _id: id, status: "open" },
            { $set: { status: "resolved", resolvedAt: new Date() } },
            { session },
          );
        if (!result.modifiedCount) return false;
        await db
          .collection<AuditDoc>("audit")
          .insertOne(toDocument(audit), { session });
        return true;
      }),
    );
  }
}
