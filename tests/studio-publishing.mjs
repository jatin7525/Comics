import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { MongoClient } from "mongodb";
import sharp from "sharp";
if (
  !process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:27028/") ||
  process.env.STORAGE_DRIVER !== "local"
)
  throw new Error("Local services only");
const origin = "http://localhost:3101";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const context = await browser.newContext({ baseURL: origin });
const admin = await browser.newContext({ baseURL: "http://localhost:3102" });
const client = new MongoClient(process.env.MONGODB_URI);
const ids = [];
context.setDefaultTimeout(15000);
try {
  const login = await context.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: "author@astra.test", password: process.env.SEED_PASSWORD },
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  await page.goto("/studio/publications/new");
  await page.getByRole("button", { name: /Start a comic/ }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Studio workflow verification");
  await page
    .getByLabel("Synopsis", { exact: true })
    .fill(
      "A test story about explorers returning from the moon to their families.",
    );
  await page.getByLabel("Tags", { exact: true }).fill("lunarjourney, family");
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await page.getByLabel("Select comic pages").waitFor();
  const id = page.url().split("/").at(-1);
  ids.push(id);
  const buffer = await sharp({
    create: { width: 240, height: 320, channels: 3, background: "#7861c8" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Cover / thumbnail", { exact: true })
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer });
  await page.getByLabel("Select comic pages").setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      name: `page-${i + 1}.png`,
      mimeType: "image/png",
      buffer,
    })),
  );
  await page
    .getByRole("button", { name: "Move selected page 2 earlier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Upload selected images (6)", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Saved pages · 5", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Move saved page 2 earlier", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Move saved page 2 earlier",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByLabel("Story text", { exact: true })
    .fill("Publicprevieworbit A young explorer returns home.");
  await page
    .getByRole("button", { name: "Save page text", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save page text", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Preview page 5", exact: true })
    .click();
  await page
    .getByLabel("Story text", { exact: true })
    .fill("Protectedendingorbit The secret final revelation.");
  await page
    .getByRole("button", { name: "Save page text", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save page text", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Select comic pages").setInputFiles(
    [6, 7].map((n) => ({
      name: `page-${n}.png`,
      mimeType: "image/png",
      buffer,
    })),
  );
  await page.getByLabel("Start a new chapter with these pages").check();
  await page
    .getByLabel("New chapter title", { exact: true })
    .fill("Homecoming");
  await page
    .getByRole("button", { name: "Upload selected images (2)", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Saved pages · 7", exact: true })
    .waitFor();
  await expect(page.getByLabel("Chapter 2 title", { exact: true })).toHaveValue(
    "Homecoming",
  );
  await expect(page.getByText("Pages 1–5", { exact: true })).toBeVisible();
  await page.getByLabel("Chapter 1 title", { exact: true }).fill("Liftoff");
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page.getByLabel("Chapter 3 title", { exact: true }).fill("Epilogue");
  await page
    .getByRole("button", { name: "Save chapters", exact: true })
    .click();
  await expect(
    page.getByText("Chapter 3 starts", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-publishing-pages.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile document overflow",
  );
  await page.screenshot({
    path: "test-results/studio-publishing-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "Continue to access", exact: true })
    .click();
  await page
    .getByLabel("Reading access", { exact: true })
    .selectOption("purchase");
  await page.getByLabel("Price (INR)", { exact: true }).fill("149.50");
  await page.getByLabel(/I own this work/).check();
  await page
    .getByRole("button", { name: "Save & review", exact: true })
    .click();
  await expect(page.getByText(/₹149.50/)).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByText("Submitted. Your work is awaiting editorial review.", {
      exact: true,
    })
    .waitFor();
  const db = client.db(process.env.MONGODB_DATABASE);
  const publication = await db.collection("publications").findOne({ _id: id });
  assert.equal(publication.pricePaise, 14950);
  assert.deepEqual(
    publication.chapters.map(({ title, startPage }) => [title, startPage]),
    [
      ["Liftoff", 1],
      ["Homecoming", 6],
      ["Epilogue", 7],
    ],
  );
  const adminLogin = await admin.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3102" },
    data: { email: "admin@astra.test", password: process.env.SEED_PASSWORD },
  });
  assert.equal(adminLogin.status(), 200);
  const review = await admin.request.post(`/api/admin/reviews/${id}`, {
    headers: { Origin: "http://localhost:3102" },
    data: {
      version: publication.version,
      decision: "published",
      note: "Verified temporary browser test publication.",
    },
  });
  assert.equal(review.status(), 200, await review.text());
  const guest = await browser.newContext();
  const reader = await guest.newPage();
  await reader.goto(`http://localhost:3100/read/${publication.slug}/1`);
  await expect(reader.locator("img.reading-page").first()).toBeVisible();
  await expect(reader.getByText(/Publicprevieworbit/)).toHaveCount(0);
  await expect(
    reader.getByRole("heading", { name: "Chapter 1 · Liftoff" }),
  ).toBeVisible();
  const chapterSelect = reader.getByRole("combobox", { name: "Chapter" });
  await expect(chapterSelect).toHaveValue(publication.chapters[0].id);
  await expect(
    reader.getByRole("button", { name: "Previous chapter" }),
  ).toBeDisabled();
  // The first three pages render on the server; scrolling fetches page 4 and then stops at the gate.
  await expect(reader.locator("img.reading-page")).toHaveCount(3);
  await reader.mouse.wheel(0, 20000);
  await expect(reader.locator("img.reading-page")).toHaveCount(4);
  await expect(
    reader.getByRole("link", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
  await reader
    .locator('[data-page="4"]')
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(reader).toHaveURL(new RegExp(`/read/${publication.slug}/4$`));
  const media = await guest.request.get(
    `http://localhost:3100/api/comics/${id}/media/1?v=${publication.version}`,
  );
  assert.match(media.headers()["cache-control"], /private, max-age=604800/);
  const blocked = await guest.request.get(
    `http://localhost:3100/api/comics/${id}/media/5`,
  );
  assert.equal(blocked.status(), 401);
  assert.match(blocked.headers()["cache-control"], /no-store/);
  await reader.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await reader.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Reader mobile overflow",
  );
  await reader.screenshot({ path: "test-results/reader-mobile.png" });
  await reader.setViewportSize({ width: 1280, height: 900 });
  await reader.evaluate(() => window.scrollTo(0, 0));
  await reader.screenshot({
    path: "test-results/reader-chapters.png",
    fullPage: true,
  });
  await chapterSelect.selectOption({ label: "Chapter 2: Homecoming" });
  await expect(reader).toHaveURL(new RegExp(`/read/${publication.slug}/6$`));
  await expect(
    reader.getByText("Page 6 is not part of the free preview."),
  ).toBeVisible();
  await reader.goto(`http://localhost:3100/read/${publication.slug}/5`);
  assert.equal(
    (await reader.content()).includes("Protectedendingorbit"),
    false,
  );
  await reader.goto(`http://localhost:3100/comics/${publication.slug}`);
  await expect(
    reader.getByText(/Individual purchase price: ₹149.50/),
  ).toBeVisible();
  await expect(reader.getByText(/3 chapters · 7 pages/)).toBeVisible();
  await expect(
    reader.getByRole("link", { name: /Chapter 2.*Homecoming.*Page 6$/ }),
  ).toHaveAttribute("href", `/read/${publication.slug}/6`);
  await reader.screenshot({
    path: "test-results/reader-chapter-list.png",
    fullPage: true,
  });
  for (const [term, count] of [
    ["lunarjourney", 1],
    ["Publicprevieworbit", 1],
    ["Protectedendingorbit", 0],
  ]) {
    const r = await guest.request.get(
      `http://localhost:3100/api/catalog?search=${term}`,
    );
    assert.equal((await r.json()).items.length, count);
  }
  await guest.close();
  await page.goto("/studio/publications/new");
  await page.getByRole("button", { name: /Start artwork/ }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Studio artwork verification");
  await page
    .getByLabel("Artwork description", { exact: true })
    .fill("An original portrait made for the local publishing flow test.");
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await page.getByLabel("Artwork image", { exact: true }).waitFor();
  ids.push(page.url().split("/").at(-1));
  await expect(page.getByLabel("Select comic pages")).toHaveCount(0);
  console.log(
    "Studio flow passed: separate types, batch upload, reorder, page text, chapters, INR price, review, public search and protected text.",
  );
} finally {
  const db = client.db(process.env.MONGODB_DATABASE);
  for (const id of ids) {
    const publication = await db
      .collection("publications")
      .findOne({ _id: id });
    const pages = await db.collection("pages").find({ comicId: id }).toArray();
    for (const key of [
      ...pages.map((page) => page.storageKey),
      publication?.coverKey,
    ].filter(Boolean)) {
      await fetch(`${process.env.LOCAL_R2_URL}/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${process.env.LOCAL_R2_TOKEN}` },
      });
    }
    await db.collection("pages").deleteMany({ comicId: id });
    await db.collection("publications").deleteOne({ _id: id });
    await db.collection("audit").deleteMany({ targetId: id });
  }
  await context.request.post("/api/auth/logout", {
    headers: { Origin: origin },
  });
  await admin.request.post("/api/auth/logout", {
    headers: { Origin: "http://localhost:3102" },
  });
  await client.close();
  await browser.close();
}
