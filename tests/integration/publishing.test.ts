import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  database,
  closeMongo,
} from "../../src/infrastructure/mongo/connection";
import { ensureIndexes } from "../../src/infrastructure/mongo/indexes";
import {
  MongoAccounts,
  MongoEntitlements,
  MongoRateLimiter,
} from "../../src/infrastructure/mongo/accounts";
import { MongoPublications } from "../../src/infrastructure/mongo/publications";
import { MongoAdministration } from "../../src/infrastructure/mongo/administration";
import { MongoCommunity } from "../../src/infrastructure/mongo/community";
import { createStorage } from "../../src/infrastructure/storage/factory";
import { AuthService, sessionHash } from "../../src/application/auth-service";
import { PublicationService } from "../../src/application/publication-service";
import { ReadingService } from "../../src/application/reading-service";
import { AdminService } from "../../src/application/admin-service";
import type { Publication, User } from "../../src/domain/models";
import type { PublicationInput } from "../../src/domain/validation";

if (
  process.env.NODE_ENV === "production" ||
  !process.env.MONGODB_URI?.includes("127.0.0.1")
)
  throw new Error("Integration tests require local MongoDB.");
process.env.MONGODB_DATABASE = `astra_test_${Date.now()}`;
const accounts = new MongoAccounts(),
  publications = new MongoPublications(),
  adminRepo = new MongoAdministration(),
  community = new MongoCommunity(),
  entitlements = new MongoEntitlements();
const storage = createStorage(),
  auth = new AuthService(accounts),
  publishing = new PublicationService(publications, storage, adminRepo),
  admin = new AdminService(adminRepo, publications),
  reading = new ReadingService(publications, entitlements, storage, community);
const author: User = {
  id: randomUUID(),
  name: "Test Author",
  email: "author@test.invalid",
  role: "author",
  status: "active",
  createdAt: new Date(),
};
const moderator: User = {
  ...author,
  id: randomUUID(),
  role: "admin",
  name: "Test Admin",
};
const other: User = { ...author, id: randomUUID() };
const input: PublicationInput = {
  title: "A real database test",
  synopsis: "An original story used to exercise publishing workflows.",
  genre: "Fantasy",
  kind: "comic",
  access: "membership",
  ageRating: "everyone",
  rightsConfirmed: true,
};
let image: Buffer;
let created: Publication;
const keys: string[] = [];

before(async () => {
  await ensureIndexes();
  image = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#7861c8" },
  })
    .webp()
    .toBuffer();
});
after(async () => {
  const db = await database();
  const docs = await db.collection("pages").find().toArray();
  const covers = await db.collection("publications").find().toArray();
  for (const doc of docs)
    if (typeof doc.storageKey === "string") keys.push(doc.storageKey);
  for (const doc of covers)
    if (typeof doc.coverKey === "string") keys.push(doc.coverKey);
  await Promise.all(keys.map((key) => storage.delete(key)));
  if (!db.databaseName.startsWith("astra_test_"))
    throw new Error("Refusing to drop a non-test database.");
  await db.dropDatabase();
  await closeMongo();
});

describe("persistent publishing workflow", { concurrency: false }, () => {
  it("creates a draft with server-owned authorship", async () => {
    created = await publishing.create(author, input);
    assert.equal(created.status, "draft");
    assert.equal((await publications.find(created.id))?.authorId, author.id);
    await assert.rejects(
      publishing.create({ ...author, role: "reader" }, input),
      /authorized author/,
    );
  });
  it("enforces ownership and rejects incomplete submission", async () => {
    await assert.rejects(
      publishing.edit(other, created.id, 1, input),
      /not found/,
    );
    await assert.rejects(publishing.submit(author, created.id, 1), /cover/);
  });
  it("stores images in actual Miniflare R2 and appends ordered pages", async () => {
    await publishing.upload(
      author,
      created.id,
      1,
      "cover",
      image,
      "A purple square cover.",
    );
    for (let page = 1; page <= 5; page++) {
      const current = (await publications.find(created.id))!;
      await publishing.upload(
        author,
        created.id,
        current.version,
        "page",
        image,
        `Illustrated page ${page}.`,
      );
    }
    const current = (await publications.find(created.id))!;
    assert.equal(current.pageCount, 5);
    assert.equal((await publications.pages(created.id))[4]?.number, 5);
    const object = await storage.get(current.coverKey!);
    assert.equal(object?.contentType, "image/webp");
    assert.equal(
      (await new Response(object!.body).arrayBuffer()).byteLength,
      image.byteLength,
    );
  });
  it("prevents stale edits and locks submitted publications", async () => {
    await assert.rejects(
      publishing.edit(author, created.id, 1, input),
      /changed/,
    );
    let current = (await publications.find(created.id))!;
    await publishing.submit(author, created.id, current.version);
    current = (await publications.find(created.id))!;
    await assert.rejects(
      publishing.upload(
        author,
        created.id,
        current.version,
        "page",
        image,
        "Another page.",
      ),
      /review/,
    );
    assert.equal(
      (await publications.catalog({ kind: "comic", limit: 12 })).items.length,
      0,
    );
  });
  it("commits exactly one concurrent editorial decision and audit event", async () => {
    const current = (await publications.find(created.id))!;
    await assert.rejects(
      admin.review({ ...author, role: "admin" }, created.id, {
        version: current.version,
        decision: "published",
        note: "",
      }),
      /different administrator/,
    );
    const decisions = await Promise.allSettled([
      admin.review(moderator, created.id, {
        version: current.version,
        decision: "published",
        note: "Rights and pages checked.",
      }),
      admin.review(moderator, created.id, {
        version: current.version,
        decision: "published",
        note: "Competing review.",
      }),
    ]);
    assert.equal(
      decisions.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal((await adminRepo.audit()).length, 1);
    assert.equal(
      (await publications.catalog({ kind: "comic", limit: 12 })).items.length,
      1,
    );
  });
  it("blocks direct fifth-page media for guests and readers without grants", async () => {
    const object = await reading.image(created.id, 4, null);
    await new Response(object.body).arrayBuffer();
    await assert.rejects(reading.image(created.id, 5, null), /Sign in/);
    await assert.rejects(
      reading.image(created.id, 5, { ...author, role: "reader" }),
      /entitlement/,
    );
  });
  it("supports membership and checks expiry on every protected request", async () => {
    const db = await database();
    await db
      .collection("entitlements")
      .insertOne({
        userId: author.id,
        kind: "membership",
        comicId: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
    const object = await reading.image(created.id, 5, author);
    await new Response(object.body).arrayBuffer();
    await db
      .collection("entitlements")
      .updateMany({ userId: author.id }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(reading.image(created.id, 5, author), /entitlement/);
  });
  it("removes hidden publications from both discovery and direct media", async () => {
    const current = (await publications.find(created.id))!;
    await admin.hide(
      moderator,
      created.id,
      current.version,
      "Temporarily hidden for investigation.",
    );
    assert.equal(
      (await publications.catalog({ kind: "comic", limit: 12 })).items.length,
      0,
    );
    await assert.rejects(reading.image(created.id, 1, null), /not available/);
  });
});

describe("sessions and distributed rate limits", () => {
  it("stores only session hashes, expires sessions, and revokes on role changes", async () => {
    const result = await auth.register({
      name: "Reader",
      email: "reader@test.invalid",
      password: "A-long-test-password-123",
    });
    assert.equal((await auth.currentUser(result.token))?.role, "reader");
    const session = await (
      await database()
    )
      .collection("sessions")
      .findOne({ userId: result.user.id });
    assert.equal(session?._id, sessionHash(result.token));
    assert.notEqual(session?._id, result.token);
    await admin.updateUser(
      moderator,
      result.user.id,
      "author",
      "active",
      "Approved creator onboarding.",
    );
    assert.equal(await auth.currentUser(result.token), null);
    const renewed = await auth.login(
      "reader@test.invalid",
      "A-long-test-password-123",
    );
    assert.equal(renewed.user.role, "author");
    await admin.updateUser(
      moderator,
      result.user.id,
      "author",
      "suspended",
      "Suspended pending investigation.",
    );
    assert.equal(await auth.currentUser(renewed.token), null);
    await assert.rejects(
      auth.login("reader@test.invalid", "A-long-test-password-123"),
      /incorrect/,
    );
  });
  it("counts simultaneous requests atomically", async () => {
    const limiter = new MongoRateLimiter();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        limiter.consume("concurrent-test", 5, 60),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  });
});
