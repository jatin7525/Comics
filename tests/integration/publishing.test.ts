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
import { chapterRanges } from "../../src/domain/chapters";
import { MongoComments } from "../../src/infrastructure/mongo/comments";
import { CommentService } from "../../src/application/comment-service";
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
  publishing = new PublicationService(
    publications,
    storage,
    adminRepo,
    new MongoComments(),
  ),
  admin = new AdminService(adminRepo, publications),
  reading = new ReadingService(publications, entitlements, storage, community);
const commentRepo = new MongoComments(),
  comments = new CommentService(commentRepo, publications, entitlements);
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
  it("splits a draft comic into validated chapters", async () => {
    let current = (await publications.find(created.id))!;
    const chapters = [
      { title: "Arrival", startPage: 1 },
      { title: "Departure", startPage: 4 },
    ];
    await assert.rejects(
      publishing.setChapters(other, created.id, current.version, chapters),
      /not found/,
    );
    for (const invalid of [
      [{ title: "Late start", startPage: 2 }],
      [...chapters, { title: "Beyond the pages", startPage: 6 }],
      [chapters[0]!, { ...chapters[1]!, startPage: 1 }],
    ])
      await assert.rejects(
        publishing.setChapters(author, created.id, current.version, invalid),
        /first chapter must start on page 1/,
      );
    const results = await Promise.allSettled([
      publishing.setChapters(author, created.id, current.version, chapters),
      publishing.setChapters(author, created.id, current.version, chapters),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    current = (await publications.find(created.id))!;
    const ranges = chapterRanges(current);
    assert.deepEqual(
      ranges.map(({ title, startPage, endPage }) => [
        title,
        startPage,
        endPage,
      ]),
      [
        ["Arrival", 1, 3],
        ["Departure", 4, 5],
      ],
    );
    // Saving the same IDs keeps chapter identity; details edits leave chapters alone.
    await publishing.setChapters(author, created.id, current.version, [
      ranges[0]!,
      { id: ranges[1]!.id, title: "The departure", startPage: 4 },
    ]);
    current = (await publications.find(created.id))!;
    await publishing.edit(author, created.id, current.version, {
      ...input,
      tags: ["moonquest", "space"],
      pricePaise: null,
    });
    current = (await publications.find(created.id))!;
    assert.deepEqual(
      current.chapters?.map(({ id, title }) => [id, title]),
      [
        [ranges[0]!.id, "Arrival"],
        [ranges[1]!.id, "The departure"],
      ],
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
    await assert.rejects(
      publishing.setChapters(author, created.id, current.version, []),
      /awaiting review/,
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
  it("loads scroll batches only up to the first locked page", async () => {
    const guest = await reading.pages(created.id, 3, 10, null);
    assert.deepEqual(
      guest.pages.map((page) => page.number),
      [3, 4],
    );
    assert.equal(guest.gate, "login_required");
    assert.equal(guest.gatePage, 5);
    assert.equal(guest.nextFrom, null);
    const reader = await reading.pages(created.id, 1, 10, {
      ...author,
      role: "reader",
    });
    assert.equal(reader.pages.length, 4);
    assert.equal(reader.gate, "payment_required");
    assert.ok(
      !JSON.stringify(reader.pages).includes("Privatesecret"),
      "story text must not be returned to readers",
    );
    const firstBatch = await reading.pages(created.id, 1, 2, null);
    assert.deepEqual(
      [firstBatch.pages.length, firstBatch.gate, firstBatch.nextFrom],
      [2, null, 3],
    );
    const locked = await reading.pages(created.id, 5, 4, null);
    assert.deepEqual([locked.pages, locked.gatePage], [[], 5]);
    await assert.rejects(
      reading.pages(created.id, 6, 4, null),
      /not available/,
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
  it("adds a reviewed chapter to a published comic without exposing it early", async () => {
    let current = (await publications.find(created.id))!;
    const startPages = current.pageCount;
    await assert.rejects(
      publishing.startRelease(other, created.id, current.version, "Return"),
      /not found/,
    );
    await assert.rejects(
      publishing.startRelease(
        author,
        created.id,
        current.version - 1,
        "Return",
      ),
      /changed/,
    );
    await publishing.startRelease(
      author,
      created.id,
      current.version,
      "Return",
    );
    current = (await publications.find(created.id))!;
    await assert.rejects(
      publishing.startRelease(author, created.id, current.version, "Again"),
      /already preparing/,
    );
    for (const n of [1, 2]) {
      current = (await publications.find(created.id))!;
      await publishing.uploadReleasePage(
        author,
        created.id,
        current.version,
        image,
        `New chapter page ${n}.`,
      );
    }
    current = (await publications.find(created.id))!;
    assert.equal(current.pageCount, startPages);
    assert.equal(current.release?.pageCount, 2);
    await assert.rejects(
      reading.image(created.id, startPages + 1, author),
      /entitlement|not available/,
    );
    await assert.rejects(
      reading.pages(created.id, startPages + 1, 2, author),
      /not available/,
    );
    await publishing.submitRelease(author, created.id, current.version);
    current = (await publications.find(created.id))!;
    await assert.rejects(
      publishing.uploadReleasePage(
        author,
        created.id,
        current.version,
        image,
        "Late page added.",
      ),
      /awaiting review/,
    );
    await assert.rejects(
      admin.reviewRelease(author, created.id, {
        version: current.version,
        decision: "approved",
        note: "",
      }),
      /Administrator/,
    );
    await admin.reviewRelease(moderator, created.id, {
      version: current.version,
      decision: "changes_requested",
      note: "Please add a closing page.",
    });
    current = (await publications.find(created.id))!;
    assert.equal(current.release?.status, "changes_requested");
    await publishing.submitRelease(author, created.id, current.version);
    current = (await publications.find(created.id))!;
    const decisions = await Promise.allSettled([
      admin.reviewRelease(moderator, created.id, {
        version: current.version,
        decision: "approved",
        note: "",
      }),
      admin.reviewRelease(moderator, created.id, {
        version: current.version,
        decision: "approved",
        note: "",
      }),
    ]);
    assert.equal(
      decisions.filter((result) => result.status === "fulfilled").length,
      1,
    );
    current = (await publications.find(created.id))!;
    assert.equal(current.pageCount, startPages + 2);
    assert.equal(current.release, null);
    assert.deepEqual(current.chapters?.at(-1)?.title, "Return");
    assert.equal(current.chapters?.at(-1)?.startPage, startPages + 1);
    assert.equal(
      await (await database()).collection("audit").countDocuments({
        targetId: created.id,
        action: "chapter_release.approved",
      }),
      1,
    );
    // Readers cannot discuss a chapter they cannot open.
    const returnChapter = current.chapters!.at(-1)!;
    await assert.rejects(
      comments.post(other, created.id, returnChapter.id, "Spoilers ahead."),
      /once you can read/,
    );
    await comments.post(
      other,
      created.id,
      current.chapters![0]!.id,
      "Lovely opening.",
    );
    assert.equal(
      (
        await comments.list(
          created.id,
          current.chapters![0]!.id,
          undefined,
          null,
        )
      ).total,
      1,
    );
    // Discarding an unfinished chapter deletes its pages and stored images.
    await publishing.startRelease(author, created.id, current.version, "Draft");
    current = (await publications.find(created.id))!;
    await publishing.uploadReleasePage(
      author,
      created.id,
      current.version,
      image,
      "A page to discard.",
    );
    const discarded = (await publications.page(created.id, startPages + 3))!;
    current = (await publications.find(created.id))!;
    await publishing.discardRelease(author, created.id, current.version);
    assert.equal(await publications.page(created.id, startPages + 3), null);
    assert.equal(await storage.get(discarded.storageKey), null);
    assert.equal((await publications.find(created.id))?.release, null);
  });
  it("marks administrator work as Originals that its creator may publish", async () => {
    const authored = await publishing.create(author, {
      ...input,
      title: "An independent story",
    });
    assert.equal(authored.original, false);
    const original = await publishing.create(moderator, {
      ...input,
      title: "An in-house universe",
      access: "free",
    });
    assert.equal(original.original, true);
    let current = original;
    await publishing.upload(
      moderator,
      original.id,
      current.version,
      "cover",
      image,
      "Original cover art.",
    );
    for (let page = 1; page <= 5; page++) {
      current = (await publications.find(original.id))!;
      await publishing.upload(
        moderator,
        original.id,
        current.version,
        "page",
        image,
        `Original page ${page}.`,
      );
    }
    current = (await publications.find(original.id))!;
    await publishing.submit(moderator, original.id, current.version);
    current = (await publications.find(original.id))!;
    await admin.review(moderator, original.id, {
      version: current.version,
      decision: "published",
      note: "",
    });
    const originals = await publications.catalog({
      kind: "comic",
      limit: 12,
      original: true,
    });
    assert.deepEqual(
      originals.items.map((item) => item.id),
      [original.id],
    );
    // Keep the shared catalog empty for later tests.
    current = (await publications.find(original.id))!;
    await admin.hide(
      moderator,
      original.id,
      current.version,
      "Removing the test original after verification.",
    );
  });
  it("stores an administrator-chosen site name", async () => {
    assert.equal(
      (await adminRepo.policy()).siteName,
      process.env.SITE_NAME || "Astra Comics",
    );
    await admin.policy(moderator, {
      adsEnabled: true,
      submissionsEnabled: true,
      siteName: "Nova Panels",
    });
    assert.equal((await adminRepo.policy()).siteName, "Nova Panels");
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

describe("managing published comics", { concurrency: false }, () => {
  let comic: Publication;
  const fresh = async () => (await publications.find(comic.id))!;
  const ordered = async () =>
    (await publications.pages(comic.id)).map((page) => page.alt);
  it("publishes a two-chapter comic to manage", async () => {
    comic = await publishing.create(author, {
      ...input,
      title: "A comic to manage",
      access: "free",
    });
    await publishing.upload(
      author,
      comic.id,
      1,
      "cover",
      image,
      "Managed cover art.",
    );
    for (let page = 1; page <= 6; page++)
      await publishing.upload(
        author,
        comic.id,
        (await fresh()).version,
        "page",
        image,
        `Managed page ${page}.`,
      );
    const pages = await publications.pages(comic.id);
    await publishing.setChapters(author, comic.id, (await fresh()).version, [
      { title: "Alpha", startPage: 1 },
      { title: "Beta", startPage: 4 },
    ]);
    await publishing.submit(author, comic.id, (await fresh()).version);
    await admin.review(moderator, comic.id, {
      version: (await fresh()).version,
      decision: "published",
      note: "",
    });
    assert.equal((await fresh()).status, "published");
    assert.equal(pages.length, 6);
  });
  it("applies detail and chapter edits immediately with an audit trail", async () => {
    await assert.rejects(
      publishing.edit(author, comic.id, (await fresh()).version, {
        ...input,
        access: "free",
        title: "No rights",
        rightsConfirmed: false,
      }),
      /rights/,
    );
    await publishing.edit(author, comic.id, (await fresh()).version, {
      ...input,
      access: "free",
      title: "A managed comic, renamed",
    });
    const current = await fresh();
    assert.equal(current.title, "A managed comic, renamed");
    assert.equal(current.status, "published");
    await publishing.setChapters(author, comic.id, current.version, [
      { id: current.chapters![0]!.id, title: "Alpha (revised)", startPage: 1 },
      { id: current.chapters![1]!.id, title: "Beta", startPage: 4 },
    ]);
    assert.equal((await fresh()).chapters?.[0]?.title, "Alpha (revised)");
    await assert.rejects(
      publishing.submit(author, comic.id, (await fresh()).version),
      /changed/,
    );
    const db = await database();
    assert.equal(
      await db.collection("audit").countDocuments({
        targetId: comic.id,
        action: { $in: ["publication.edited", "publication.chapters_updated"] },
      }),
      2,
    );
  });
  it("inserts, replaces, reorders and removes pages while shifting chapters", async () => {
    await publishing.upload(
      author,
      comic.id,
      (await fresh()).version,
      "page",
      image,
      "Inserted into Alpha.",
      (await fresh()).chapters![0]!.id,
    );
    let current = await fresh();
    assert.equal(current.pageCount, 7);
    assert.equal((await ordered())[3], "Inserted into Alpha.");
    assert.deepEqual(
      current.chapters?.map((chapter) => chapter.startPage),
      [1, 5],
    );
    const first = (await publications.page(comic.id, 1))!;
    await publishing.replacePage(
      author,
      comic.id,
      current.version,
      first.id,
      image,
    );
    const replaced = (await publications.page(comic.id, 1))!;
    assert.notEqual(replaced.storageKey, first.storageKey);
    assert.equal(await storage.get(first.storageKey), null);
    current = await fresh();
    const ids = (await publications.pages(comic.id)).map((page) => page.id);
    await publishing.reorder(author, comic.id, current.version, [
      ids[1]!,
      ids[0]!,
      ...ids.slice(2),
    ]);
    assert.equal((await publications.page(comic.id, 2))?.id, ids[0]);
    current = await fresh();
    const removed = (await publications.page(comic.id, 2))!;
    await publishing.removePage(author, comic.id, current.version, removed.id);
    current = await fresh();
    assert.equal(current.pageCount, 6);
    assert.deepEqual(
      current.chapters?.map((chapter) => chapter.startPage),
      [1, 4],
    );
    assert.equal(await storage.get(removed.storageKey), null);
    await assert.rejects(
      publishing.removePage(other, comic.id, current.version, ids[2]!),
      /not found/,
    );
  });
  it("blocks page-sequence edits while a new chapter is being prepared", async () => {
    await publishing.startRelease(
      author,
      comic.id,
      (await fresh()).version,
      "Gamma",
    );
    const current = await fresh();
    const page = (await publications.page(comic.id, 1))!;
    await assert.rejects(
      publishing.removePage(author, comic.id, current.version, page.id),
      /Finish or discard/,
    );
    await publishing.discardRelease(author, comic.id, current.version);
  });
  it("keeps per-chapter comment threads with author and owner moderation", async () => {
    const current = await fresh();
    const [alpha, beta] = current.chapters!;
    const reader = { ...other, name: "Chapter Reader" };
    const mine = await comments.post(
      reader,
      comic.id,
      alpha!.id,
      "Loved this chapter!",
    );
    await comments.post(author, comic.id, alpha!.id, "Thank you for reading.");
    await comments.post(reader, comic.id, beta!.id, "On to the next one.");
    const list = await comments.list(comic.id, alpha!.id, undefined, reader);
    assert.equal(list.total, 2);
    assert.deepEqual(
      list.items.map((item) => item.body),
      ["Thank you for reading.", "Loved this chapter!"],
    );
    assert.deepEqual(
      list.items.map((item) => [item.mine, item.canDelete, item.byAuthor]),
      [
        [false, false, true],
        [true, true, false],
      ],
    );
    const asOwner = await comments.list(comic.id, alpha!.id, undefined, author);
    assert.ok(asOwner.items.every((item) => item.canDelete));
    const asGuest = await comments.list(comic.id, alpha!.id, undefined, null);
    assert.ok(asGuest.items.every((item) => !item.canDelete && !item.mine));
    await assert.rejects(
      comments.remove(reader, comic.id, asOwner.items[0]!.id),
      /only delete your own/,
    );
    await comments.remove(author, comic.id, mine.id);
    assert.equal(
      (await comments.list(comic.id, alpha!.id, undefined, null)).total,
      1,
    );
    await assert.rejects(
      comments.list(comic.id, randomUUID(), undefined, null),
      /Chapter not found/,
    );
    await assert.rejects(
      comments.post(reader, comic.id, "comic", "Wrong thread."),
      /Chapter not found/,
    );
    for (let n = 0; n < 21; n++)
      await comments.post(reader, comic.id, alpha!.id, `Comment ${n}`);
    const first = await comments.list(comic.id, alpha!.id, undefined, null);
    assert.equal(first.items.length, 20);
    assert.ok(first.nextCursor);
    const second = await comments.list(
      comic.id,
      alpha!.id,
      first.nextCursor!,
      null,
    );
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
  });
  it("permanently deletes a chapter, then the whole comic", async () => {
    let current = await fresh();
    const beta = current.chapters![1]!;
    const betaPages = (await publications.pages(comic.id)).filter(
      (page) => page.number >= beta.startPage,
    );
    await publishing.deleteChapter(author, comic.id, current.version, beta.id);
    current = await fresh();
    assert.equal(current.pageCount, beta.startPage - 1);
    assert.deepEqual(
      current.chapters?.map((chapter) => chapter.title),
      ["Alpha (revised)"],
    );
    for (const page of betaPages)
      assert.equal(await storage.get(page.storageKey), null);
    assert.equal(
      await (
        await database()
      )
        .collection("comments")
        .countDocuments({ comicId: comic.id, chapterId: beta.id }),
      0,
    );
    await assert.rejects(
      publishing.deleteChapter(
        author,
        comic.id,
        current.version,
        current.chapters![0]!.id,
      ),
      /only chapter/,
    );
    await community.save(other.id, comic.id, true);
    const remaining = await publications.pages(comic.id);
    await assert.rejects(
      publishing.deleteComic(other, comic.id, current.version),
      /not found/,
    );
    await publishing.deleteComic(author, comic.id, current.version);
    assert.equal(await publications.find(comic.id), null);
    assert.equal((await publications.pages(comic.id)).length, 0);
    assert.equal(await community.isSaved(other.id, comic.id), false);
    for (const page of remaining)
      assert.equal(await storage.get(page.storageKey), null);
    assert.equal(await storage.get(current.coverKey!), null);
    assert.equal(
      await (
        await database()
      )
        .collection("comments")
        .countDocuments({ comicId: comic.id }),
      0,
    );
    assert.equal(
      await (
        await database()
      )
        .collection("audit")
        .countDocuments({ targetId: comic.id, action: "publication.deleted" }),
      1,
    );
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
