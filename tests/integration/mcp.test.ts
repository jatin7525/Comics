import { before, beforeEach, after, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MongoMcp } from "../../src/infrastructure/mongo/mcp";
import { MongoAccounts } from "../../src/infrastructure/mongo/accounts";
import { MongoPublications } from "../../src/infrastructure/mongo/publications";
import { MongoImageAnnotations } from "../../src/infrastructure/mongo/image-annotations";
import { MongoAdministration } from "../../src/infrastructure/mongo/administration";
import { MongoComments } from "../../src/infrastructure/mongo/comments";
import {
  database,
  closeMongo,
} from "../../src/infrastructure/mongo/connection";
import { ensureIndexes } from "../../src/infrastructure/mongo/indexes";
import { toDocument } from "../../src/infrastructure/mongo/documents";
import {
  McpAuthService,
  pkce,
  hash,
} from "../../src/application/mcp/auth-service";
import { McpReadingService } from "../../src/application/mcp/reading-service";
import { PublicationService } from "../../src/application/publication-service";
import { createComicMcp } from "../../src/server/mcp/protocol";
import type { User, Publication, ComicPage } from "../../src/domain/models";
import type { ObjectStorage } from "../../src/application/ports";

if (
  process.env.NODE_ENV === "production" ||
  !process.env.MONGODB_URI?.includes("127.0.0.1")
)
  throw new Error("MCP tests require local MongoDB.");
process.env.MONGODB_DATABASE = `astra_mcp_test_${randomUUID().replaceAll("-", "")}`;
const repository = new MongoMcp(),
  accounts = new MongoAccounts(),
  publications = new MongoPublications(),
  annotations = new MongoImageAnnotations();
const resource = "https://admin.example/mcp";
const auth = new McpAuthService(repository, accounts, resource, publications);
const objects = new Map<string, Uint8Array>();
const storage: ObjectStorage = {
  async put(key, data) {
    objects.set(key, data);
  },
  async get(key) {
    const data = objects.get(key);
    return data
      ? {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(data);
              controller.close();
            },
          }),
          contentType: "image/webp",
          size: data.length,
        }
      : null;
  },
  async delete(key) {
    objects.delete(key);
  },
};
const reading = new McpReadingService(
  publications,
  storage,
  annotations,
  repository,
);
const publishing = new PublicationService(
  publications,
  storage,
  new MongoAdministration(),
  new MongoComments(),
);
const admin: User = {
  id: randomUUID(),
  name: "MCP Admin",
  email: "admin@mcp.invalid",
  role: "admin",
  status: "active",
  createdAt: new Date(),
};
const reader: User = {
  ...admin,
  id: randomUUID(),
  email: "reader@mcp.invalid",
  role: "reader",
};
const author: User = {
  ...admin,
  id: randomUUID(),
  email: "author@mcp.invalid",
  role: "author",
};
const defaults = {
  enabled: true,
  registrationEnabled: false,
  annotationsEnabled: true,
  previewEnabled: true,
  allowedPublicationIds: [] as string[],
  allowedOrigins: [] as string[],
};
let image: Buffer;
before(async () => {
  await ensureIndexes();
  for (const user of [admin, reader, author])
    await accounts.create({ ...user, passwordHash: "unused-test-hash" });
  image = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#7059c7" },
  })
    .webp()
    .toBuffer();
});
beforeEach(async () => {
  await auth.configure(admin, { ...defaults });
});
after(async () => {
  await (await database()).dropDatabase();
  await closeMongo();
});
async function connection(
  scope = "comics:read",
  user = admin,
  dynamic = false,
) {
  const { client } = await auth.register(
    { name: "Test AI", redirectUris: ["http://127.0.0.1:4200/callback"] },
    dynamic ? undefined : admin,
  );
  const verifier = "a".repeat(64);
  const query = new URLSearchParams({
    client_id: client.id,
    response_type: "code",
    redirect_uri: client.redirectUris[0]!,
    resource,
    scope,
    code_challenge: pkce(verifier),
    code_challenge_method: "S256",
    state: "state-test",
  });
  const consent = await auth.consent(user, query);
  const callback = new URL(await auth.approve(user, consent.ticket, true));
  assert.equal(callback.searchParams.get("state"), "state-test");
  const body = new URLSearchParams({
    client_id: client.id,
    grant_type: "authorization_code",
    resource,
    code: callback.searchParams.get("code")!,
    redirect_uri: client.redirectUris[0]!,
    code_verifier: verifier,
  });
  return { client, query, body, consent };
}
async function fixture(
  status: Publication["status"] = "published",
  release = true,
) {
  const now = new Date(),
    id = randomUUID();
  const publication: Publication = {
    id,
    slug: id,
    original: true,
    title: "Selected reference",
    authorId: admin.id,
    authorName: author.name,
    synopsis: "A private chapter about a hero in a violet cape.",
    kind: "comic",
    genre: "Fantasy",
    access: "purchase",
    pricePaise: 50000,
    ageRating: "everyone",
    rightsConfirmed: true,
    status,
    coverKey: null,
    pageCount: 2,
    version: 1,
    feedback: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "published" ? now : null,
    chapters: [{ id: randomUUID(), title: "First chapter", startPage: 1 }],
    release:
      status === "published" && release
        ? {
            id: randomUUID(),
            title: "Unreleased",
            status: "draft",
            pageCount: 2,
            feedback: null,
            createdAt: now,
            updatedAt: now,
          }
        : null,
  };
  await publications.create(publication);
  const pages: ComicPage[] = Array.from(
    { length: publication.release ? 4 : 2 },
    (_, i) => ({
      id: randomUUID(),
      comicId: id,
      number: i + 1,
      storageKey: `test/${randomUUID()}`,
      bytes: image.length,
      alt: `Page ${i + 1} image description`,
      storyText: i > 1 ? "PRIVATE STORY TEXT" : "Selected page dialogue",
    }),
  );
  for (const page of pages)
    await storage.put(page.storageKey, image, "image/webp");
  await (
    await database()
  )
    .collection<Omit<ComicPage, "id"> & { _id: string }>("pages")
    .insertMany(pages.map(toDocument));
  return { publication, pages };
}
async function select(ids: string[]) {
  await auth.configure(admin, { ...defaults, allowedPublicationIds: ids });
}

it("denies reader/author OAuth and Bearer connections, even for valid accounts", async () => {
  for (const user of [reader, author]) {
    await assert.rejects(
      () => connection("comics:read", user),
      /Only administrators/,
    );
    await assert.rejects(
      () =>
        auth.issueToken(admin, {
          name: "Invalid",
          email: user.email,
          days: 1,
          annotate: false,
        }),
      /Only administrators/,
    );
    await assert.rejects(
      () => auth.configure(user, defaults),
      /Only administrators/,
    );
  }
});
it("OAuth code uses exact callback, resource, PKCE and single-use consent", async () => {
  const c = await connection();
  await assert.rejects(
    () => auth.approve(admin, c.consent.ticket, true),
    /Consent expired/,
  );
  for (const [key, value] of [
    ["redirect_uri", "https://evil.invalid"],
    ["resource", "https://reader.example/mcp"],
    ["code_verifier", "b".repeat(64)],
  ]) {
    const bad = new URLSearchParams(c.body);
    bad.set(key!, value!);
    await assert.rejects(() => auth.exchange(bad));
  }
  const bad = new URLSearchParams(c.query);
  bad.set("redirect_uri", "http://127.0.0.1:4200/callback/other");
  await assert.rejects(() => auth.authorization(bad), /Callback/);
  const tokens = await auth.exchange(c.body);
  assert.equal(
    (await auth.authenticate(tokens.access_token)).user.id,
    admin.id,
  );
  const saved = (await repository.grants()).find(
    (g) => g.id === tokens.access_token.split(".")[1],
  )!;
  assert.equal(saved.accessHash, hash(tokens.access_token));
  assert(!JSON.stringify(saved).includes(tokens.access_token));
  await assert.rejects(() => auth.exchange(c.body), /already used/);
  await assert.rejects(() => auth.authenticate(tokens.access_token), /revoked/);
});
it("rotates refresh tokens and revokes a family after replay", async () => {
  const c = await connection();
  const first = await auth.exchange(c.body);
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: c.client.id,
    resource,
    refresh_token: first.refresh_token,
  });
  const second = await auth.exchange(form);
  await auth.authenticate(second.access_token);
  await assert.rejects(() => auth.authenticate(first.access_token), /Invalid/);
  await assert.rejects(() => auth.exchange(form), /reuse detected/);
  await assert.rejects(() => auth.authenticate(second.access_token), /revoked/);
});
it("connects dynamically registered clients through admin consent and enforces client credentials", async () => {
  await auth.configure(admin, { ...defaults, registrationEnabled: true });
  const c = await connection("comics:read", admin, true);
  assert.equal(c.client.status, "approved");
  await assert.rejects(() => auth.consent(reader, c.query));
  await assert.rejects(() => auth.consent(author, c.query));
  const denied = await auth.consent(admin, c.query);
  const callback = new URL(await auth.approve(admin, denied.ticket, false));
  assert.equal(callback.searchParams.get("error"), "access_denied");
  assert.equal(callback.searchParams.has("code"), false);
  await assert.rejects(() => auth.approve(admin, denied.ticket, true));
  await (
    await database()
  )
    .collection("mcpClients")
    .updateOne({ _id: c.client.id } as never, {
      $set: { secretHash: hash("client-secret") },
    });
  await assert.rejects(
    () => auth.exchange(c.body),
    /Invalid client credentials/,
  );
  c.body.set("client_secret", "client-secret");
  const token = await auth.exchange(c.body);
  await auth.clientStatus(admin, c.client.id, "revoked");
  await assert.rejects(() => auth.authenticate(token.access_token));
});
it("revokes access immediately after account demotion and disable/re-enable", async () => {
  const token = await auth.issueToken(admin, {
    name: "Read",
    email: admin.email,
    days: 1,
    annotate: false,
  });
  await (
    await database()
  )
    .collection("accounts")
    .updateOne({ _id: admin.id } as never, { $set: { role: "reader" } });
  try {
    await assert.rejects(
      () => auth.authenticate(token.token),
      /Only administrators/,
    );
  } finally {
    await (
      await database()
    )
      .collection("accounts")
      .updateOne({ _id: admin.id } as never, { $set: { role: "admin" } });
  }
  await auth.configure(admin, { ...defaults, enabled: false });
  await auth.configure(admin, defaults);
  await assert.rejects(() => auth.authenticate(token.token), /revoked/);
});
it("defaults to an empty curated catalog; direct IDs and slugs cannot bypass selection", async () => {
  const selected = await fixture(),
    outside = await fixture();
  assert.deepEqual((await reading.catalog({ limit: 20 }, admin)).items, []);
  await assert.rejects(
    () => reading.details(selected.publication.id, admin),
    /not selected/,
  );
  await select([selected.publication.id]);
  assert.deepEqual(
    (await reading.catalog({ limit: 20 }, admin)).items.map((p) => p.id),
    [selected.publication.id],
  );
  await assert.rejects(
    () => reading.read(outside.publication.slug, 1, admin, true),
    /not selected/,
  );
  await assert.rejects(
    () => reading.catalog({ limit: 20 }, reader),
    /Only administrators/,
  );
  const data = await reading.read(selected.publication.id, 2, admin, true);
  assert(data.image);
  assert.equal(data.data.nextPage, null);
  await select([]);
  await assert.rejects(
    () => reading.read(selected.publication.id, 1, admin, false),
    /not selected/,
  );
});
it("unpublished content needs preview scope and remains outside ordinary reads", async () => {
  const live = await fixture(),
    draft = await fixture("draft", false);
  await select([live.publication.id, draft.publication.id]);
  await assert.rejects(
    () => reading.read(live.publication.id, 3, admin, false),
    /not found/,
  );
  await assert.rejects(
    () => reading.details(draft.publication.id, admin),
    /not found/,
  );
  const result = await reading.read(live.publication.id, 3, admin, false, true);
  assert.equal(result.data.storyText, "PRIVATE STORY TEXT");
  assert.equal(result.data.unpublished, true);
  assert.equal(
    (await reading.catalog({ limit: 20 }, admin, true)).items.length,
    2,
  );
  await auth.configure(admin, {
    ...defaults,
    allowedPublicationIds: [live.publication.id],
    previewEnabled: false,
  });
  await assert.rejects(
    () => reading.read(live.publication.id, 3, admin, false, true),
    /disabled/,
  );
  await assert.rejects(
    () =>
      auth.issueToken(admin, {
        name: "Preview",
        email: admin.email,
        days: 1,
        annotate: false,
        preview: true,
      }),
    /preview first/,
  );
});
it("tags are versioned, image-bound and references track page reordering", async () => {
  const { publication: pub, pages } = await fixture();
  await select([pub.id]);
  const read = await reading.read(pub.id, 3, admin, false, true);
  const input = {
    comicId: pub.id,
    page: 3,
    imageRevision: read.data.imageRevision,
    expectedVersion: 0,
    characters: ["Thunder Boy"],
    tags: ["Violet Cape"],
    description: "Hero with a violet cape",
  };
  await reading.annotate(admin, input, true);
  await assert.rejects(
    () => reading.annotate(admin, input, true),
    /Tags changed/,
  );
  assert.equal(
    (await reading.references(admin, { character: "thunder boy", limit: 10 }))
      .items.length,
    0,
  );
  await publishing.reorderRelease(admin, pub.id, 1, [
    pages[3]!.id,
    pages[2]!.id,
  ]);
  const ref = await reading.references(
    admin,
    { character: "thunder boy", limit: 10 },
    true,
  );
  assert.equal(ref.items[0]?.page, 4);
  assert.equal(ref.items[0]?.readTool, "read_unpublished_page");
  await publishing.replacePage(admin, pub.id, 2, pages[2]!.id, image);
  assert.equal(
    (
      await reading.references(
        admin,
        { character: "thunder boy", limit: 10 },
        true,
      )
    ).items.length,
    0,
  );
  await assert.rejects(
    () =>
      reading.annotate(admin, { ...input, page: 4, expectedVersion: 1 }, true),
    /image changed/,
  );
});
it("private chapter supports page text, replace, reorder and delete without publishing", async () => {
  const { publication: pub, pages } = await fixture();
  await publishing.editPage(
    admin,
    pub.id,
    1,
    pages[2]!.id,
    "New draft description",
    "PRIVATE UPDATED DIALOGUE",
  );
  assert(!(await publications.find(pub.id))?.previewText?.includes("PRIVATE"));
  await publishing.replacePage(admin, pub.id, 2, pages[2]!.id, image);
  await publishing.reorderRelease(admin, pub.id, 3, [
    pages[3]!.id,
    pages[2]!.id,
  ]);
  await assert.rejects(
    () =>
      publishing.reorderRelease(admin, pub.id, 4, [pages[0]!.id, pages[2]!.id]),
    /invalid/,
  );
  await publishing.removePage(admin, pub.id, 4, pages[3]!.id);
  let current = (await publications.find(pub.id))!;
  assert.equal(current.pageCount, 2);
  assert.equal(current.release?.pageCount, 1);
  assert.equal((await publications.page(pub.id, 3))?.id, pages[2]!.id);
  await publishing.submitRelease(admin, pub.id, current.version);
  current = (await publications.find(pub.id))!;
  await assert.rejects(
    () =>
      publishing.editPage(
        admin,
        pub.id,
        current.version,
        pages[2]!.id,
        "Blocked draft text",
        "Must not save",
      ),
    /no longer editable/,
  );
  await assert.rejects(
    () =>
      publishing.replacePage(
        admin,
        pub.id,
        current.version,
        pages[2]!.id,
        image,
      ),
    /changed/,
  );
  await assert.rejects(
    () =>
      publishing.reorderRelease(admin, pub.id, current.version, [pages[2]!.id]),
    /awaiting review/,
  );
  assert.equal((await publications.page(pub.id, 1))?.id, pages[0]!.id);
});
it("SDK exposes no write/preview tools to read-only connections and returns page images", async () => {
  const { publication: pub } = await fixture();
  await select([pub.id]);
  for (const elevated of [false, true]) {
    const server = createComicMcp(reading, admin, elevated, elevated);
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(a);
      await client.connect(b);
      const tools = (await client.listTools()).tools;
      assert.equal(
        tools.some((t) => t.name === "annotate_comic_image"),
        elevated,
      );
      assert.equal(
        tools.some((t) => t.name === "read_unpublished_page"),
        elevated,
      );
      if (!elevated) assert(tools.every((t) => t.annotations?.readOnlyHint));
      const response = await client.callTool({
        name: "read_comic_page",
        arguments: { comicId: pub.id, page: 1 },
      });
      assert(!response.isError);
      assert(
        (response.content as { type: string }[]).some(
          (c) => c.type === "image",
        ),
      );
      const blocked = await client.callTool({
        name: "read_comic_page",
        arguments: { comicId: pub.id, page: 3 },
      });
      assert.equal(blocked.isError, true);
      const invalid = await client.callTool({
        name: "search_comics",
        arguments: { limit: 100000 },
      });
      assert.equal(invalid.isError, true);
    } finally {
      await client.close();
      await server.close();
    }
  }
});

it("independent-author comics cannot be selected or read even with a forged settings entry", async () => {
  const { publication: pub, pages } = await fixture();
  await (
    await database()
  )
    .collection<{ _id: string }>("publications")
    .updateOne(
      { _id: pub.id },
      { $set: { original: false, authorId: author.id } },
    );
  await assert.rejects(() => select([pub.id]), /Only existing admin-created/);
  // Defense in depth: bypass configuration validation to simulate stale or imported settings.
  await repository.updateSettings(
    { ...defaults, allowedPublicationIds: [pub.id] },
    auth.audit(admin, "test.settings", pub.id, "Test only"),
  );
  assert.deepEqual(
    (await reading.catalog({ limit: 20 }, admin, true)).items,
    [],
  );
  await assert.rejects(() => reading.read(pub.id, 1, admin, false));
  await assert.rejects(() => reading.previewDetails(pub.id, admin));
  const revision = hash(pages[0]!.storageKey);
  await annotations.save(
    {
      id: pages[0]!.id,
      comicId: pub.id,
      imageRevision: revision,
      characters: ["private character"],
      tags: [],
      description: "Author content",
      version: 1,
      updatedAt: new Date(),
      updatedBy: admin.id,
    },
    0,
    auth.audit(admin, "test.annotation", pub.id, "Test only"),
  );
  assert.deepEqual(
    (
      await reading.references(
        admin,
        { character: "private character", limit: 10 },
        true,
      )
    ).items,
    [],
  );
  await assert.rejects(() =>
    reading.annotate(
      admin,
      {
        comicId: pub.id,
        page: 1,
        imageRevision: revision,
        expectedVersion: 1,
        characters: [],
        tags: [],
        description: "Must fail",
      },
      true,
    ),
  );
});
