import type { McpRepository } from "@/application/mcp/ports";
import type { AuditEvent } from "@/domain/models";
import {
  defaultMcpSettings,
  type McpSettings,
  type McpClient,
  type McpGrant,
  type McpTicket,
} from "@/domain/mcp/models";
import { database, mongoClient } from "./connection";
import { fromDocument, toDocument } from "./documents";
import type { ClientSession } from "mongodb";

type Doc<T extends { id: string }> = Omit<T, "id"> & { _id: string };
export class MongoMcp implements McpRepository {
  private async audited(
    audit: AuditEvent | undefined,
    task: (session?: ClientSession) => Promise<unknown>,
  ) {
    if (!audit) {
      await task();
      return;
    }
    const db = await database();
    await (
      await mongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        await task(session);
        await db
          .collection<Doc<AuditEvent>>("audit")
          .insertOne(toDocument(audit), { session });
      }),
    );
  }
  async settings() {
    const doc = await (
      await database()
    )
      .collection<McpSettings & { _id: string }>("mcpSettings")
      .findOne({ _id: "mcp" });
    return doc
      ? {
          enabled: doc.enabled,
          registrationEnabled: doc.registrationEnabled,
          annotationsEnabled: doc.annotationsEnabled ?? false,
          previewEnabled: doc.previewEnabled ?? false,
          allowedPublicationIds: doc.allowedPublicationIds ?? [],
          allowedOrigins: doc.allowedOrigins,
          generation: doc.generation,
        }
      : { ...defaultMcpSettings };
  }
  async updateSettings(
    patch: Omit<McpSettings, "generation">,
    audit: AuditEvent,
  ) {
    await this.audited(audit, async (session) => {
      await (
        await database()
      )
        .collection<McpSettings & { _id: string }>("mcpSettings")
        .updateOne(
          { _id: "mcp" },
          {
            $set: patch,
            // Disabling permanently invalidates every existing credential, even after re-enabling.
            ...(patch.enabled
              ? { $setOnInsert: { generation: 0 } }
              : { $inc: { generation: 1 } }),
          },
          { upsert: true, session },
        );
    });
  }
  async clients() {
    return (
      await (
        await database()
      )
        .collection<Doc<McpClient>>("mcpClients")
        .find()
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()
    ).map((d) => fromDocument<McpClient>(d));
  }
  async client(id: string) {
    const d = await (
      await database()
    )
      .collection<Doc<McpClient>>("mcpClients")
      .findOne({ _id: id });
    return d ? fromDocument<McpClient>(d) : null;
  }
  async createClient(client: McpClient, audit?: AuditEvent) {
    await this.audited(audit, async (session) =>
      (await database())
        .collection<Doc<McpClient>>("mcpClients")
        .insertOne(toDocument(client), { session }),
    );
  }
  async setClientStatus(
    id: string,
    status: "approved" | "revoked",
    audit: AuditEvent,
  ) {
    await this.audited(audit, async (session) =>
      (await database())
        .collection<Doc<McpClient>>("mcpClients")
        .updateOne(
          { _id: id },
          { $set: { status }, $inc: { revision: 1 } },
          { session },
        ),
    );
  }
  async grants(userId?: string) {
    return (
      await (
        await database()
      )
        .collection<Doc<McpGrant>>("mcpGrants")
        .find(userId ? { userId } : {})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()
    ).map((d) => fromDocument<McpGrant>(d));
  }
  async grant(id: string) {
    const d = await (
      await database()
    )
      .collection<Doc<McpGrant>>("mcpGrants")
      .findOne({ _id: id });
    return d ? fromDocument<McpGrant>(d) : null;
  }
  async createGrant(grant: McpGrant, audit?: AuditEvent) {
    await this.audited(audit, async (session) =>
      (await database())
        .collection<Doc<McpGrant>>("mcpGrants")
        .insertOne(toDocument(grant), { session }),
    );
  }
  async revokeGrant(id: string, audit?: AuditEvent) {
    await this.audited(audit, async (session) =>
      (await database())
        .collection<Doc<McpGrant>>("mcpGrants")
        .updateOne(
          { _id: id },
          { $set: { revokedAt: new Date() } },
          { session },
        ),
    );
  }
  async rotateGrant(
    id: string,
    expectedHash: string,
    patch: Pick<McpGrant, "accessHash" | "accessExpiresAt" | "refreshHash">,
  ) {
    const result = await (
      await database()
    )
      .collection<Doc<McpGrant>>("mcpGrants")
      .updateOne(
        {
          _id: id,
          refreshHash: expectedHash,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: patch, $push: { usedRefreshHashes: expectedHash } },
      );
    return result.modifiedCount === 1;
  }
  async createTicket(ticket: McpTicket) {
    await (
      await database()
    )
      .collection<Doc<McpTicket>>("mcpTickets")
      .insertOne(toDocument(ticket));
  }
  async ticket(id: string) {
    const d = await (
      await database()
    )
      .collection<Doc<McpTicket>>("mcpTickets")
      .findOne({ _id: id });
    return d ? fromDocument<McpTicket>(d) : null;
  }
  async consumeTicket(id: string) {
    const r = await (
      await database()
    )
      .collection<Doc<McpTicket>>("mcpTickets")
      .updateOne(
        { _id: id, consumedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { consumedAt: new Date() } },
      );
    return r.modifiedCount === 1;
  }
  async redeemCode(ticketId: string, grant: McpGrant, audit: AuditEvent) {
    const db = await database();
    return !!(await (
      await mongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        const result = await db
          .collection<Doc<McpTicket>>("mcpTickets")
          .updateOne(
            {
              _id: ticketId,
              kind: "code",
              consumedAt: null,
              expiresAt: { $gt: new Date() },
            },
            { $set: { consumedAt: new Date() } },
            { session },
          );
        if (!result.modifiedCount) {
          await db
            .collection<Doc<McpGrant>>("mcpGrants")
            .updateOne(
              { _id: grant.id },
              { $set: { revokedAt: new Date() } },
              { session },
            );
          return false;
        }
        await db
          .collection<Doc<McpGrant>>("mcpGrants")
          .insertOne(toDocument(grant), { session });
        await db
          .collection<Doc<AuditEvent>>("audit")
          .insertOne(toDocument(audit), { session });
        return true;
      }),
    ));
  }
}
