import { MongoAuthorApplications } from "../../src/infrastructure/mongo/author-applications";
import { AuthorApplicationService } from "../../src/application/author-application-service";
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
  it("saves page text and reorders atomically without exposing protected text to search", async () => {
    let current = (await publications.find(created.id))!;
    const pages = await publications.pages(created.id);
    await publishing.editPage(
      author,
      created.id,
      current.version,
      pages[0]!.id,
      "A visible introductory scene.",
      "Previewnebula explorers greet the moon.",
    );
    current = (await publications.find(created.id))!;
    await publishing.editPage(
      author,
      created.id,
      current.version,
      pages[4]!.id,
      "A protected final scene.",
      "Privatesecret the hidden ending.",
    );
    current = (await publications.find(created.id))!;
    assert.ok(current.previewText?.includes("Previewnebula"));
    assert.ok(!current.previewText?.includes("Privatesecret"));
    await assert.rejects(
      publishing.reorder(
        other,
        created.id,
        current.version,
        pages.map((page) => page.id),
      ),
      /not found/,
    );
    await assert.rejects(
      publishing.reorder(author, created.id, current.version, [
        pages[0]!.id,
        pages[0]!.id,
      ]),
      /invalid/,
    );
    const ids = pages.map((page) => page.id).reverse();
    const results = await Promise.allSettled([
      publishing.reorder(author, created.id, current.version, ids),
      publishing.reorder(author, created.id, current.version, ids),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    current = (await publications.find(created.id))!;
    assert.ok(current.previewText?.includes("Privatesecret"));
    assert.ok(!current.previewText?.includes("Previewnebula"));
    assert.equal((await publications.page(created.id, 1))?.id, pages[4]!.id);
    await publishing.reorder(
      author,
      created.id,
      current.version,
      pages.map((page) => page.id),
    );
    current = (await publications.find(created.id))!;
    await publishing.edit(author, created.id, current.version, {
      ...input,
      tags: ["moonquest", "space"],
      pricePaise: null,
    });
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
  it("searches tags and preview text without matching protected page text", async () => {
    for (const search of ["moonquest", "Previewnebula"])
      assert.equal(
        (await publications.catalog({ kind: "comic", limit: 12, search }))
          .items[0]?.id,
        created.id,
      );
    assert.equal(
      (
        await publications.catalog({
          kind: "comic",
          limit: 12,
          search: "Privatesecret",
        })
      ).items.length,
      0,
    );
  });
  it("recommends matching tags while excluding drafts and other age ratings", async () => {
    const base = (await publications.find(created.id))!;
    const relatedId = randomUUID(),
      hiddenId = randomUUID(),
      matureId = randomUUID();
    try {
      await publications.create({
        ...base,
        id: relatedId,
        slug: relatedId,
        genre: "Mystery",
        title: "Related title",
        tags: ["moonquest"],
      });
      await publications.create({
        ...base,
        id: hiddenId,
        slug: hiddenId,
        status: "draft",
      });
      await publications.create({
        ...base,
        id: matureId,
        slug: matureId,
        ageRating: "mature",
      });
      const results = await publications.related(base);
      assert.deepEqual(
        results.map((item) => item.id),
        [relatedId],
      );
    } finally {
      await (
        await database()
      )
        .collection("publications")
        .deleteMany({ _id: { $in: [relatedId, hiddenId, matureId] } as never });
    }
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
    await db.collection("entitlements").insertOne({
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
      "reader",
      "active",
      "Approved creator onboarding.",
    );
    assert.equal(await auth.currentUser(result.token), null);
    const renewed = await auth.login(
      "reader@test.invalid",
      "A-long-test-password-123",
    );
    assert.equal(renewed.user.role, "reader");
    await admin.updateUser(
      moderator,
      result.user.id,
      "reader",
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

describe("independent service sessions", () => {
  it("rejects reader tokens in staff services and checks current role on every request", async () => {
    const studioAuth = new AuthService(accounts, "studio");
    const adminAuth = new AuthService(accounts, "admin");
    const credentials = {
      name: "Service test",
      email: "services@test.invalid",
      password: "A-long-service-password-123",
    };
    const registered = await auth.register(credentials);
    await assert.rejects(
      studioAuth.register({ ...credentials, email: "staff@test.invalid" }),
      /reader platform/,
    );
    await assert.rejects(
      studioAuth.login(credentials.email, credentials.password),
      /workspace/,
    );
    await assert.rejects(
      adminAuth.login(credentials.email, credentials.password),
      /workspace/,
    );
    const db = await database();
    await db
      .collection<{ _id: string; role: string }>("accounts")
      .updateOne({ _id: registered.user.id }, { $set: { role: "admin" } });
    // Even a reader-service session belonging to an admin is not an admin-service session.
    assert.equal(await studioAuth.currentUser(registered.token), null);
    assert.equal(await adminAuth.currentUser(registered.token), null);
    const studioSession = await studioAuth.login(
      credentials.email,
      credentials.password,
    );
    const adminSession = await adminAuth.login(
      credentials.email,
      credentials.password,
    );
    assert.equal(
      (await studioAuth.currentUser(studioSession.token))?.role,
      "admin",
    );
    assert.equal(
      (await adminAuth.currentUser(adminSession.token))?.role,
      "admin",
    );
    assert.equal(await auth.currentUser(adminSession.token), null);
    assert.equal(await adminAuth.currentUser(studioSession.token), null);
    await studioAuth.logout(adminSession.token);
    assert.ok(await adminAuth.currentUser(adminSession.token));
    await studioAuth.logout(studioSession.token);
    assert.equal(await studioAuth.currentUser(studioSession.token), null);
    assert.ok(await auth.currentUser(registered.token));
    await db
      .collection<{ _id: string; role: string }>("accounts")
      .updateOne({ _id: registered.user.id }, { $set: { role: "reader" } });
    assert.equal(await adminAuth.currentUser(adminSession.token), null);
  });
});

describe("author access applications", () => {
  it("keeps samples private, supports revisions, and grants access once with an audit event", async () => {
    const repository = new MongoAuthorApplications();
    const applications = new AuthorApplicationService(repository, storage);
    const registered = await auth.register({
      name: "Applicant",
      email: "applicant@test.invalid",
      password: "A-long-application-password",
    });
    const applicant = registered.user;
    const other = { ...applicant, id: randomUUID() };
    const draft = await applications.start(applicant);
    assert.equal((await applications.start(applicant)).id, draft.id);
    await assert.rejects(
      admin.updateUser(
        moderator,
        applicant.id,
        "author",
        "active",
        "Attempt to bypass application review.",
      ),
      /application/,
    );
    await assert.rejects(
      applications.submit(applicant, draft.id, draft.version),
      /Save your/,
    );
    await assert.rejects(
      applications.save(other, draft.id, draft.version, {
        introduction: "An original artist who creates expressive ink drawings.",
        portfolioUrl: "",
        sampleKind: "artwork",
        processNotes:
          "I draw original sketches and colour them digitally myself.",
        rightsConfirmed: true,
      }),
      /not found/,
    );
    await applications.save(applicant, draft.id, 1, {
      introduction: "An original artist who creates expressive ink drawings.",
      portfolioUrl: "https://example.com/portfolio",
      sampleKind: "comic",
      processNotes:
        "I draw original sketches and colour them digitally myself.",
      rightsConfirmed: true,
    });
    const bytes = await sharp({
      create: { width: 160, height: 160, channels: 3, background: "#7861c8" },
    })
      .webp()
      .toBuffer();
    await applications.upload(
      applicant,
      draft.id,
      2,
      bytes,
      "Original ink study for a short story.",
    );
    let current = (await repository.find(draft.id))!;
    const sample = current.samples[0]!;
    await assert.rejects(
      applications.reorder(other, draft.id, current.version, [sample.id]),
      /not found/,
    );
    await assert.rejects(
      applications.reorder(applicant, draft.id, current.version, [
        sample.id,
        sample.id,
      ]),
      /exactly once/,
    );
    await assert.rejects(
      applications.reorder(applicant, draft.id, current.version, []),
      /exactly once/,
    );
    await applications.upload(
      applicant,
      draft.id,
      current.version,
      bytes,
      "Thumbnail for application review.",
      true,
    );
    current = (await repository.find(draft.id))!;
    assert.equal(current.samples.length, 1);
    const thumbnail = current.thumbnail!;
    await assert.rejects(
      applications.image(other, draft.id, thumbnail.id, false),
      /not found/,
    );
    await applications.remove(
      applicant,
      draft.id,
      current.version,
      thumbnail.id,
    );
    assert.equal(await storage.get(thumbnail.storageKey), null);
    current = (await repository.find(draft.id))!;

    await assert.rejects(
      applications.image(other, draft.id, sample.id, false),
      /not found/,
    );
    await assert.rejects(
      applications.image(applicant, draft.id, sample.id, true),
      /Administrator/,
    );
    const image = await applications.image(
      moderator,
      draft.id,
      sample.id,
      true,
    );
    assert.deepEqual(
      Buffer.from(await new Response(image.body).arrayBuffer()),
      bytes,
    );
    await assert.rejects(
      applications.submit(applicant, draft.id, current.version),
      /two pages/,
    );
    await applications.save(applicant, draft.id, current.version, {
      introduction: current.introduction,
      portfolioUrl: current.portfolioUrl,
      sampleKind: "artwork",
      processNotes: current.processNotes,
      rightsConfirmed: true,
    });
    current = (await repository.find(draft.id))!;
    await applications.submit(applicant, draft.id, current.version);
    current = (await repository.find(draft.id))!;
    await assert.rejects(
      applications.upload(
        applicant,
        draft.id,
        current.version,
        bytes,
        "Should not change a submitted sample.",
      ),
      /awaiting review/,
    );
    await assert.rejects(
      applications.review(applicant, draft.id, {
        version: current.version,
        decision: "approved",
        note: "I approve my own application.",
        reviewedSamples: true,
      }),
      /Administrator/,
    );
    await applications.review(moderator, draft.id, {
      version: current.version,
      decision: "changes_requested",
      note: "Please include a sketch that shows your process.",
      reviewedSamples: true,
    });
    assert.equal((await accounts.findUser(applicant.id))?.role, "reader");
    current = (await repository.find(draft.id))!;
    await applications.remove(applicant, draft.id, current.version, sample.id);
    assert.equal(await storage.get(sample.storageKey), null);
    current = (await repository.find(draft.id))!;
    await applications.upload(
      applicant,
      draft.id,
      current.version,
      bytes,
      "Original sketch with visible construction lines.",
    );
    current = (await repository.find(draft.id))!;
    const finalSample = current.samples[0]!;
    try {
      await applications.submit(applicant, draft.id, current.version);
      current = (await repository.find(draft.id))!;
      const decision = {
        version: current.version,
        decision: "approved" as const,
        note: "Reviewed the artwork and the supporting process sketch.",
        reviewedSamples: true as const,
      };
      const results = await Promise.allSettled([
        applications.review(moderator, draft.id, decision),
        applications.review(moderator, draft.id, decision),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await accounts.findUser(applicant.id))?.role, "author");
      assert.equal(await auth.currentUser(registered.token), null);
      assert.equal(
        await (await database()).collection("audit").countDocuments({
          targetId: draft.id,
          action: "author_application.approved",
        }),
        1,
      );
      const studio = new AuthService(accounts, "studio");
      assert.equal(
        (
          await studio.login(
            "applicant@test.invalid",
            "A-long-application-password",
          )
        ).user.role,
        "author",
      );
      assert.equal(
        (await publications.catalog({ kind: "comic", limit: 12 })).items.length,
        0,
      );
    } finally {
      await storage.delete(finalSample.storageKey);
    }
  });
});
