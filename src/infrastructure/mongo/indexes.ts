import { database } from "./connection";

export async function ensureIndexes() {
  const db = await database();
  await Promise.all([
    db.collection("accounts").createIndex({ email: 1 }, { unique: true }),
    db
      .collection("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("sessions").createIndex({ userId: 1 }),
    db.collection("publications").createIndex({ slug: 1 }, { unique: true }),
    db
      .collection("publications")
      .createIndex({ status: 1, kind: 1, createdAt: -1, _id: -1 }),
    db
      .collection("publications")
      .createIndex({ status: 1, kind: 1, genre: 1, createdAt: -1, _id: -1 }),
    db
      .collection("publications")
      .createIndex({ status: 1, kind: 1, access: 1, createdAt: -1, _id: -1 }),
    db.collection("publications").createIndex({ authorId: 1, updatedAt: -1 }),
    db
      .collection("publications")
      .createIndex({ title: "text", authorName: "text", synopsis: "text" }),
    db
      .collection("pages")
      .createIndex({ comicId: 1, number: 1 }, { unique: true }),
    db
      .collection("entitlements")
      .createIndex({ userId: 1, kind: 1, comicId: 1 }),
    db
      .collection("saved")
      .createIndex({ userId: 1, comicId: 1 }, { unique: true }),
    db.collection("saved").createIndex({ userId: 1, updatedAt: -1 }),
    db
      .collection("progress")
      .createIndex({ userId: 1, comicId: 1 }, { unique: true }),
    db.collection("progress").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("progress").createIndex({ comicId: 1 }),
    db
      .collection("follows")
      .createIndex({ userId: 1, authorId: 1 }, { unique: true }),
    db.collection("follows").createIndex({ authorId: 1 }),
    db.collection("reports").createIndex({ status: 1, createdAt: -1 }),
    db.collection("audit").createIndex({ createdAt: -1 }),
    db
      .collection("rateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
