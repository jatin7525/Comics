import { MongoServerError } from "mongodb";
import type {
  AccountRepository,
  EntitlementRepository,
  RateLimiter,
} from "@/application/ports";
import type { Account, Session, User } from "@/domain/models";
import { AppError } from "@/domain/errors";
import { database } from "./connection";
import {
  fromDocument,
  toDocument,
  type AccountDoc,
  type GrantDoc,
  type SessionDoc,
} from "./documents";

export class MongoAccounts implements AccountRepository {
  async findByEmail(email: string) {
    const doc = await (
      await database()
    )
      .collection<AccountDoc>("accounts")
      .findOne({ email });
    return doc ? fromDocument<Account>(doc) : null;
  }
  async findUser(id: string): Promise<User | null> {
    const doc = await (
      await database()
    )
      .collection<AccountDoc>("accounts")
      .findOne({ _id: id }, { projection: { passwordHash: 0 } });
    if (!doc) return null;
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      role: doc.role,
      status: doc.status,
      createdAt: doc.createdAt,
    };
  }
  async create(account: Account) {
    try {
      await (
        await database()
      )
        .collection<AccountDoc>("accounts")
        .insertOne(toDocument(account));
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        throw new AppError(
          "EMAIL_UNAVAILABLE",
          "Unable to register with this email. Try signing in.",
          409,
        );
      throw error;
    }
  }
  async createSession(session: Session) {
    await (
      await database()
    )
      .collection<SessionDoc>("sessions")
      .insertOne(toDocument(session));
  }
  async findSession(hash: string) {
    const doc = await (
      await database()
    )
      .collection<SessionDoc>("sessions")
      .findOne({ _id: hash, expiresAt: { $gt: new Date() } });
    return doc ? fromDocument<Session>(doc) : null;
  }
  async deleteSession(hash: string) {
    await (
      await database()
    )
      .collection<SessionDoc>("sessions")
      .deleteOne({ _id: hash });
  }
}
export class MongoEntitlements implements EntitlementRepository {
  async forReader(userId: string, comicId: string) {
    const docs = await (
      await database()
    )
      .collection<GrantDoc>("entitlements")
      .find({
        userId,
        revokedAt: null,
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
          { $or: [{ kind: "membership" }, { kind: "purchase", comicId }] },
        ],
      })
      .limit(20)
      .toArray();
    return docs.map((doc) =>
      fromDocument<import("@/domain/models").Entitlement>(doc),
    );
  }
}
export class MongoRateLimiter implements RateLimiter {
  async consume(key: string, limit: number, windowSeconds: number) {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const expiresAt = new Date((bucket + 2) * windowSeconds * 1000);
    const collection = (await database()).collection<{
      _id: string;
      count: number;
      expiresAt: Date;
    }>("rateLimits");
    let record;
    try {
      record = await collection.findOneAndUpdate(
        { _id: `${key}:${bucket}` },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      // Concurrent first requests can race on the unique bucket key.
      if (!(error instanceof MongoServerError && error.code === 11000))
        throw error;
      record = await collection.findOneAndUpdate(
        { _id: `${key}:${bucket}` },
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
    }
    if (!record || record.count > limit)
      throw new AppError(
        "RATE_LIMITED",
        "Too many requests. Wait a moment and try again.",
        429,
      );
  }
}
