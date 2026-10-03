import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { MongoClient } from "mongodb";
import sharp from "sharp";
if (
  !process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:27028/") ||
  process.env.STORAGE_DRIVER !== "local"
)
  throw new Error("Local services only");
const reader = "http://localhost:3100",
  studio = "http://localhost:3101",
  adminOrigin = "http://localhost:3102";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DATABASE);
const ids = [];
const password = process.env.SEED_PASSWORD;
const image = await sharp({
  create: { width: 240, height: 320, channels: 3, background: "#7861c8" },
})
  .png()
  .toBuffer();
async function signIn(origin, email) {
  const context = await browser.newContext({ baseURL: origin });
  context.setDefaultTimeout(15000);
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email, password },
  });
  assert.equal(response.status(), 200, `${email} → ${origin}`);
  return context;
}
async function json(context, origin, method, path, data) {
  const response = await context.request.fetch(path, {
    method,
    headers: { Origin: origin },
    data,
  });
  assert.ok(response.ok(), `${method} ${path}: ${await response.text()}`);
  return response.json();
}
async function upload(context, path, version, kind) {
  const response = await context.request.post(path, {
    headers: { Origin: studio },
    multipart: {
      file: { name: "page.png", mimeType: "image/png", buffer: image },
      ...(kind ? { kind } : {}),
      version: String(version),
      alt: "A test page for the journey.",
    },
  });
  assert.equal(response.status(), 201, await response.text());
  return (await response.json()).version;
}
async function publishComic(context, admin, title) {
  const { id } = await json(context, studio, "POST", "/api/publications", {
    title,
    synopsis:
      "A temporary comic created by the originals and releases journey.",
    genre: "Fantasy",
    kind: "comic",
    access: "free",
    ageRating: "everyone",
    rightsConfirmed: true,
  });
  ids.push(id);
  let version = await upload(
    context,
    `/api/publications/${id}/upload`,
    1,
    "cover",
  );
  for (let page = 0; page < 5; page++)
    version = await upload(
      context,
      `/api/publications/${id}/upload`,
      version,
      "page",
    );
  await json(context, studio, "POST", `/api/publications/${id}/submit`, {
    version,
  });
  await json(admin, adminOrigin, "POST", `/api/admin/reviews/${id}`, {
    version: version + 1,
    decision: "published",
    note: "",
  });
  return db.collection("publications").findOne({ _id: id });
}
const policy = await db.collection("policies").findOne({ _id: "platform" });
try {
  // One administrator account signs in to Reader, Studio and Admin with the same credentials.
  const adminReader = await signIn(reader, "admin@astra.test");
  const adminStudio = await signIn(studio, "admin@astra.test");
  const admin = await signIn(adminOrigin, "admin@astra.test");
  const author = await signIn(studio, "author@astra.test");

  // Site name is editable and renders across the apps.
  await json(admin, adminOrigin, "PATCH", "/api/admin/policies", {
    adsEnabled: true,
    submissionsEnabled: true,
    siteName: "Nova Panels",
  });
  const home = await adminReader.newPage();
  await home.goto("/");
  await expect(home).toHaveTitle(/Nova Panels/);
  await expect(
    home.getByRole("link", { name: "Nova Panels home" }),
  ).toBeVisible();
  await expect(home.locator(".footer")).toContainText("Nova Panels");

  // An administrator's work is an Original they may publish themselves.
  const original = await publishComic(
    adminStudio,
    admin,
    "Journey original universe",
  );
  assert.equal(original.original, true);
  await home.goto("/originals");
  await expect(
    home.getByRole("heading", { name: "Nova Panels Originals" }),
  ).toBeVisible();
  await expect(
    home.getByRole("link", { name: "Journey original universe" }).first(),
  ).toBeVisible();
  await home.goto(`/comics/${original.slug}`);
  await expect(
    home.getByRole("link", { name: "★ Nova Panels Original" }),
  ).toBeVisible();
  await home.screenshot({ path: "test-results/original-detail.png" });

  // An author adds a chapter to a published comic through Studio.
  const comic = await publishComic(author, admin, "Journey serial comic");
  assert.equal(comic.original, false);
  const page = await author.newPage();
  await page.goto(`/studio/publications/${comic._id}`);
  await page.getByRole("button", { name: /Pages & text/ }).click();
  await page
    .getByLabel("New chapter title", { exact: true })
    .fill("The second arc");
  await page
    .getByRole("button", { name: "Start new chapter", exact: true })
    .click();
  await page
    .getByLabel("Add pages to this chapter (in reading order)")
    .setInputFiles(
      [1, 2].map((n) => ({
        name: `new-${n}.png`,
        mimeType: "image/png",
        buffer: image,
      })),
    );
  await page
    .getByRole("button", { name: "Upload pages (2)", exact: true })
    .click();
  await expect(page.getByText(/New chapter pages · 2/)).toBeVisible();
  await page
    .getByRole("button", { name: "Submit chapter for review", exact: true })
    .click();
  await expect(
    page.getByText(/Readers will see this chapter once it is approved/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-release.png",
    fullPage: true,
  });

  // Unapproved pages are not readable.
  await home.goto(`/read/${comic.slug}/6`);
  await expect(
    home.getByRole("heading", { name: "This page has left the story." }),
  ).toBeVisible();
  await expect(home.locator("img.reading-page")).toHaveCount(0);
  const earlyMedia = await home.request.get(`/api/comics/${comic._id}/media/6`);
  assert.equal(earlyMedia.status(), 404);

  // Admin approves the chapter from the dashboard.
  const console_ = await admin.newPage();
  await console_.goto("/admin");
  await expect(
    console_.getByRole("heading", { name: "New chapters awaiting review" }),
  ).toBeVisible();
  // Submitted chapters must also appear on the Review queue page itself.
  await console_.goto("/admin/reviews");
  await console_
    .getByRole("link", { name: "Journey serial comic: The second arc" })
    .click();
  await console_.getByLabel("Decision").selectOption("approved");
  await console_.getByLabel(/I have reviewed every new page/).check();
  await console_.screenshot({
    path: "test-results/admin-release-review.png",
    fullPage: true,
  });
  // Wait on the decision request itself: its first call compiles the route in development.
  const decision = console_.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/releases/") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  await console_
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  assert.equal((await decision).status(), 200);
  await expect(console_.getByText("Chapter decision saved.")).toBeVisible();

  const released = await db
    .collection("publications")
    .findOne({ _id: comic._id });
  assert.equal(released.pageCount, 7);
  assert.deepEqual(
    released.chapters.map(({ title, startPage }) => [title, startPage]),
    [
      ["Chapter 1", 1],
      ["The second arc", 6],
    ],
  );
  await home.goto(`/read/${comic.slug}/6`);
  await expect(
    home.getByRole("heading", { name: "Chapter 2 · The second arc" }),
  ).toBeVisible();

  // Readers discuss each chapter beneath its last page.
  const readerContext = await signIn(reader, "reader@astra.test");
  const readerPage = await readerContext.newPage();
  await readerPage.goto(`/read/${comic.slug}/5`);
  await readerPage
    .getByRole("button", { name: "Comments on Chapter 1", exact: true })
    .click();
  await expect(
    readerPage.getByText("No comments yet. Be the first."),
  ).toBeVisible();
  await readerPage
    .getByPlaceholder("What did you think of this chapter?")
    .fill("That cliffhanger! Can't wait for the second arc.");
  await readerPage
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await expect(
    readerPage.getByText("That cliffhanger! Can't wait for the second arc."),
  ).toBeVisible();
  await expect(
    readerPage.getByRole("heading", { name: /Comments on Chapter 1 · 1/ }),
  ).toBeVisible();
  await readerPage.screenshot({
    path: "test-results/chapter-comments.png",
    fullPage: true,
  });
  // Guests can read comments (page 5 is past their preview, so check the public API).
  const guestContext = await browser.newContext({ baseURL: reader });
  const chapterOne = (
    await db.collection("publications").findOne({ _id: comic._id })
  ).chapters[0].id;
  const thread = await guestContext.request.get(
    `/api/comics/${comic._id}/comments?chapter=${chapterOne}`,
  );
  const threadData = await thread.json();
  assert.equal(threadData.total, 1);
  assert.equal(threadData.items[0].canDelete, false);
  const anonymous = await guestContext.request.post(
    `/api/comics/${comic._id}/comments`,
    {
      headers: { Origin: reader },
      data: { chapterId: chapterOne, body: "Guest comment" },
    },
  );
  assert.equal(anonymous.status(), 401);
  await guestContext.close();

  // The author edits the live comic directly; every change is immediate.
  page.on("dialog", (dialog) =>
    dialog.type() === "prompt"
      ? dialog.accept("Journey serial comic, renamed")
      : dialog.accept(),
  );
  await page.goto(`/studio/publications/${comic._id}`);
  await expect(page.getByText(/This work is live/)).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Journey serial comic, renamed");
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await page.getByLabel("Select comic pages").waitFor();
  await home.goto(`/comics/${comic.slug}`);
  await expect(
    home.getByRole("heading", { name: "Journey serial comic, renamed" }),
  ).toBeVisible();

  const savedPages = () =>
    db
      .collection("pages")
      .find({ comicId: comic._id })
      .sort({ number: 1 })
      .toArray();
  await page.getByLabel("Select comic pages").setInputFiles({
    name: "insert.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page
    .getByLabel("Add these pages to")
    .selectOption({ label: "The end of chapter 1: Chapter 1" });
  await page
    .getByRole("button", { name: "Upload selected images (1)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved pages · 8" }),
  ).toBeVisible();
  let stored = await db.collection("publications").findOne({ _id: comic._id });
  assert.deepEqual(
    stored.chapters.map((chapter) => chapter.startPage),
    [1, 7],
  );
  assert.equal((await savedPages())[5].alt, "Comic page: insert.png");

  const before = (await savedPages())[0].storageKey;
  await page.getByLabel("Replace image for page 1").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect
    .poll(async () => (await savedPages())[0].storageKey)
    .not.toBe(before);

  await page
    .getByRole("button", { name: "Remove page 2", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved pages · 7" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-manage-live.png",
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: "Delete chapter 2 and its pages",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved pages · 5" }),
  ).toBeVisible();
  stored = await db.collection("publications").findOne({ _id: comic._id });
  assert.deepEqual(
    stored.chapters.map((chapter) => chapter.title),
    ["Chapter 1"],
  );
  assert.equal(stored.pageCount, 5);

  await page.getByRole("button", { name: /Review/ }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await page.waitForURL(/\/studio\/publications$/);
  assert.equal(
    await db.collection("publications").countDocuments({ _id: comic._id }),
    0,
  );
  assert.equal(
    await db.collection("pages").countDocuments({ comicId: comic._id }),
    0,
  );
  await home.goto(`/comics/${comic.slug}`);
  await expect(
    home.getByRole("heading", { name: "This page has left the story." }),
  ).toBeVisible();
  console.log(
    "Originals, site name, shared admin sign-in, chapter releases and live comic management passed.",
  );
} finally {
  for (const id of ids) {
    const publication = await db
      .collection("publications")
      .findOne({ _id: id });
    const pages = await db.collection("pages").find({ comicId: id }).toArray();
    for (const key of [
      ...pages.map((p) => p.storageKey),
      publication?.coverKey,
    ].filter(Boolean))
      await fetch(`${process.env.LOCAL_R2_URL}/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${process.env.LOCAL_R2_TOKEN}` },
      });
    await db.collection("pages").deleteMany({ comicId: id });
    await db.collection("publications").deleteOne({ _id: id });
    await db.collection("audit").deleteMany({ targetId: id });
  }
  // Restore the site name exactly as it was.
  if (policy)
    await db.collection("policies").replaceOne({ _id: "platform" }, policy);
  else await db.collection("policies").deleteOne({ _id: "platform" });
  await client.close();
  await browser.close();
}
