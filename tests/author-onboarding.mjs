import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
if (
  !process.env.MONGODB_URI?.startsWith("mongodb://127.0.0.1:27028/") ||
  process.env.STORAGE_DRIVER !== "local"
)
  throw new Error("Local test services only.");
const readerOrigin = "http://localhost:3100",
  adminOrigin = "http://localhost:3102",
  studioOrigin = "http://localhost:3101";
const email = `onboarding-${randomUUID()}@test.invalid`,
  password = `Test-${randomUUID()}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
});
const reader = await browser.newContext({ baseURL: readerOrigin });
const admin = await browser.newContext({ baseURL: adminOrigin });
const dbClient = new MongoClient(process.env.MONGODB_URI);
let userId, applicationId;
try {
  const response = await reader.request.post("/api/auth/register", {
    headers: { Origin: readerOrigin },
    data: { email, password, name: "Application browser test" },
  });
  assert.equal(response.status(), 200, await response.text());
  userId = (await response.json()).user.id;
  const denied = await reader.request.post(`${studioOrigin}/api/auth/login`, {
    headers: { Origin: studioOrigin },
    data: { email, password },
  });
  assert.equal(denied.status(), 403);
  const page = await reader.newPage();
  await page.goto("/become-author");
  await page
    .getByRole("button", { name: "Start my application", exact: true })
    .click();
  await page
    .getByLabel("About you", { exact: true })
    .fill(
      "I draw original comics and expressive characters using traditional pencils.",
    );
  await page
    .getByLabel("How you made this work")
    .fill(
      "I drew the sketch on paper, scanned it and coloured it myself. No other artists contributed.",
    );
  await page.getByLabel(/I created this work/).check();
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/author-applications/") &&
      r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Save application details", exact: true })
    .click();
  assert.equal((await saved).status(), 200);
  await expect(
    page.getByRole("button", { name: "Save application details", exact: true }),
  ).toBeEnabled();
  const image = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#7154b8" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Sample images", { exact: true }).setInputFiles(
    Array.from({ length: 7 }, (_, i) => ({
      name: `page-${i}.png`,
      mimeType: "image/png",
      buffer: image,
    })),
  );
  await expect(page.locator("#sample-selection-error")).toBeEmpty();
  const tiny = await sharp({
    create: { width: 120, height: 60, channels: 3, background: "#7154b8" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Thumbnail image", { exact: true }).setInputFiles({
    name: "small-thumbnail.png",
    mimeType: "image/png",
    buffer: tiny,
  });
  await expect(page.locator("#thumbnail-selection-error")).toBeEmpty();
  await expect(page.locator("#sample-selection-error")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Upload selected images", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Move selected page 2 earlier", exact: true })
    .click();

  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith("/upload") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Upload selected images", exact: true })
    .click();
  assert.equal((await uploaded).status(), 201);
  await page
    .getByRole("heading", { name: "Your private samples (7)", exact: true })
    .waitFor();
  await page.locator("img.application-thumbnail").waitFor();
  await expect(
    page.locator(".application-samples figcaption").first(),
  ).toContainText("page-1.png");
  await page
    .getByRole("button", { name: "Move page 2 earlier", exact: true })
    .click();
  await expect(
    page.locator(".application-samples figcaption").first(),
  ).toContainText("page-0.png");
  await page.screenshot({
    path: "test-results/author-application.png",
    fullPage: true,
  });
  const sampleUrl = await page
    .locator(".application-samples img")
    .first()
    .getAttribute("src");
  applicationId = sampleUrl.split("/")[3];
  const anonymous = await browser.newContext({ baseURL: readerOrigin });
  try {
    assert.equal((await anonymous.request.get(sampleUrl)).status(), 401);
  } finally {
    await anonymous.close();
  }
  await page
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await page
    .getByText("Your samples are locked while the editorial team reviews them.")
    .waitFor();
  const adminLogin = await admin.request.post("/api/auth/login", {
    headers: { Origin: adminOrigin },
    data: { email: "admin@astra.test", password: process.env.SEED_PASSWORD },
  });
  assert.equal(adminLogin.status(), 200);
  const reviewer = await admin.newPage();
  await reviewer.goto("/admin/applications");
  await reviewer
    .getByRole("link", { name: "Review application", exact: true })
    .filter({ hasText: "Review application" })
    .first()
    .waitFor();
  await reviewer.goto(`/admin/applications/${applicationId}`);
  await reviewer.locator(".application-samples img").first().waitFor();
  await reviewer.screenshot({
    path: "test-results/author-review.png",
    fullPage: true,
  });
  await reviewer.locator("select[name=decision]").selectOption("approved");
  await reviewer
    .getByLabel("Feedback to applicant")
    .fill(
      "Reviewed original sample and creation process. Approved for publishing.",
    );
  await reviewer.getByLabel(/I reviewed all samples/).check();
  const approval = reviewer.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/admin/author-applications/${applicationId}`) &&
      r.request().method() === "POST",
  );
  await reviewer
    .getByRole("button", { name: "Save author decision", exact: true })
    .click();
  assert.equal((await approval).status(), 200);
  await reviewer.getByText("Status: approved", { exact: true }).waitFor();
  await page.goto("/become-author");
  await page.waitForURL("**/login");
  const studioLogin = await reader.request.post(
    `${studioOrigin}/api/auth/login`,
    { headers: { Origin: studioOrigin }, data: { email, password } },
  );
  assert.equal(studioLogin.status(), 200);
  await page.goto(`${studioOrigin}/studio`);
  await page
    .getByRole("heading", {
      name: "Your stories are finding their people.",
      exact: true,
    })
    .waitFor();
  console.log(
    "Author application journey passed: private upload, submission, admin approval, session revocation and Studio access.",
  );
} finally {
  const db = dbClient.db(process.env.MONGODB_DATABASE);
  if (userId) {
    const application = await db
      .collection("authorApplications")
      .findOne({ userId });
    if (application) {
      for (const sample of [
        ...application.samples,
        ...(application.thumbnail ? [application.thumbnail] : []),
      ]) {
        const result = await fetch(
          `${process.env.LOCAL_R2_URL}/${sample.storageKey}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${process.env.LOCAL_R2_TOKEN}` },
          },
        );
        assert.equal(result.status, 204);
      }
      await db.collection("audit").deleteMany({ targetId: application._id });
      await db
        .collection("authorApplications")
        .deleteOne({ _id: application._id });
    }
    await db.collection("sessions").deleteMany({ userId });
    await db.collection("accounts").deleteOne({ _id: userId });
  }
  await admin.request
    .post("/api/auth/logout", { headers: { Origin: adminOrigin } })
    .catch(() => {});
  await dbClient.close();
  await browser.close();
}
