import { test, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const studioOrigin = "http://localhost:3101";
const adminOrigin = "http://localhost:3102";
const password = process.env.SEED_PASSWORD!;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error(
    "Browser tests may only target the local seeded application.",
  );
}
async function login(
  request: APIRequestContext,
  account: string,
  loginOrigin = origin,
) {
  const response = await request.post("/api/auth/login", {
    headers: { origin: loginOrigin },
    data: { email: `${account}@astra.test`, password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test("guest catalog, exact preview boundary, responsive themes and protected assets", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your next obsession." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/next-desktop-dark.png",
    fullPage: true,
    caret: "initial",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/read/neon-afterlight/4");
  await expect(page.locator(".reading-page")).toBeVisible();
  await page
    .getByRole("link", { name: "Continue reading", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The story is just getting started." }),
  ).toBeVisible();
  expect(await page.locator(".reading-page").count()).toBe(0);
  const catalog = await (await request.get("/api/catalog")).json();
  const comic = catalog.items.find(
    (item: { slug: string }) => item.slug === "neon-afterlight",
  );
  expect(comic.storageKey).toBeUndefined();
  expect(comic.coverKey).toBeUndefined();
  expect((await request.get(`/api/comics/${comic.id}/media/5`)).status()).toBe(
    401,
  );
  expect((await request.get(`/api/comics/${comic.id}/media/4`)).status()).toBe(
    200,
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width <= 600)
      expect(
        await page
          .locator('nav[aria-label="Comic genres"]:visible')
          .evaluate((element) => getComputedStyle(element).flexWrap),
      ).toBe("wrap");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/next-mobile-dark.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "All comics", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The complete collection." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("reader sign-in, persistent library/progress, authorization and CSRF", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("reader@astra.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".account-link")).toContainText("Alex");
  await page.goto("/read/where-the-wild-sleeps/5");
  await expect(page.locator(".reading-page")).toBeVisible();
  await expect
    .poll(async () => (await page.request.get("/history")).text())
    .toContain("Where the Wild Sleeps");
  await page.goto("/comics/where-the-wild-sleeps");
  const save = page.getByRole("button", { name: /Save(d)? to library/ });
  if ((await save.getAttribute("aria-pressed")) === "false") await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Where the Wild Sleeps", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Where the Wild Sleeps", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/publications", {
        headers: { origin },
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch("/api/admin/policies", {
        headers: { origin },
        data: { adsEnabled: true, submissionsEnabled: true },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post("/api/auth/logout", {
        headers: { origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect(
    (
      await request.post("/api/auth/register", {
        headers: { origin },
        data: {
          name: "Escalation",
          email: "escalate@example.test",
          password,
          role: "admin",
        },
      })
    ).status(),
  ).toBe(400);
});

test("membership does not unlock purchase-only stories and there is no payment bypass", async ({
  page,
  request,
}) => {
  await login(request, "member");
  const catalog = await (await request.get("/api/catalog")).json();
  const memberComic = catalog.items.find(
    (item: { slug: string }) => item.slug === "neon-afterlight",
  );
  const purchased = catalog.items.find(
    (item: { slug: string }) => item.slug === "the-dune-walker",
  );
  expect(
    (await request.get(`/api/comics/${memberComic.id}/media/5`)).status(),
  ).toBe(200);
  expect(
    (await request.get(`/api/comics/${purchased.id}/media/5`)).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/payments", {
        headers: { origin },
        data: { paid: true },
      })
    ).status(),
  ).toBe(404);
  await page.goto("/membership");
  await expect(
    page.getByRole("button", { name: "Subscriptions not yet available" }),
  ).toBeDisabled();
});

test("author upload, moderation, published discovery and cross-author protection", async ({
  browser,
}) => {
  const author = await browser.newContext({ baseURL: studioOrigin });
  const admin = await browser.newContext({ baseURL: adminOrigin });
  const other = await browser.newContext({ baseURL: studioOrigin });
  try {
    await login(author.request, "author", studioOrigin);
    await login(admin.request, "admin", adminOrigin);
    await login(other.request, "author2", studioOrigin);
    const page = await author.newPage();
    const title = `Browser journey ${Date.now()}`;
    await page.goto("/studio/publications/new");
    await page.getByRole("button", { name: /Start a comic/ }).click();
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page
      .getByLabel("Synopsis")
      .fill(
        "A complete sample story created to verify the real publishing workflow.",
      );
    await page
      .getByRole("button", { name: "Save & continue", exact: true })
      .click();
    await expect(page).toHaveURL(/\/studio\/publications\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").at(-1)!;
    expect(
      (
        await other.request.patch(`/api/publications/${id}`, {
          headers: { origin: studioOrigin },
          data: {
            version: 1,
            publication: {
              title,
              synopsis:
                "A complete sample story created to verify the real publishing workflow.",
              genre: "Fantasy",
              kind: "comic",
              access: "free",
              ageRating: "everyone",
              rightsConfirmed: true,
            },
          },
        })
      ).status(),
    ).toBe(404);
    const image = await sharp({
      create: { width: 400, height: 500, channels: 3, background: "#7861c8" },
    })
      .png()
      .toBuffer();
    await page
      .getByLabel("Cover / thumbnail", { exact: true })
      .setInputFiles({
        name: "cover.png",
        mimeType: "image/png",
        buffer: image,
      });
    await page
      .getByLabel("Select comic pages")
      .setInputFiles(
        Array.from({ length: 5 }, (_, index) => ({
          name: `page-${index + 1}.png`,
          mimeType: "image/png",
          buffer: image,
        })),
      );
    await page
      .getByRole("button", { name: "Upload selected images (6)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Saved pages · 5", exact: true }),
    ).toBeVisible();
    const malicious = await author.request.post(
      `/api/publications/${id}/upload`,
      {
        headers: { origin: studioOrigin },
        multipart: {
          kind: "page",
          version: "7",
          alt: "Not a valid image file.",
          file: {
            name: "bad.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
          },
        },
      },
    );
    expect(malicious.status()).toBe(400);
    await page
      .getByRole("button", { name: "Continue to access", exact: true })
      .click();
    await page.getByLabel(/I own this work/).check();
    await page
      .getByRole("button", { name: "Save & review", exact: true })
      .click();

    await page
      .getByRole("button", { name: "Submit for review", exact: true })
      .click();
    await expect(
      page.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    const reviewer = await admin.newPage();
    await reviewer.goto(`/admin/reviews/${id}`);
    await reviewer.getByLabel(/I have reviewed all pages/).check();
    await reviewer
      .getByRole("button", { name: "Save decision", exact: true })
      .click();
    await expect(
      reviewer.getByText("Published", { exact: true }),
    ).toBeVisible();
    await reviewer.goto("/admin/audit");
    await expect(
      reviewer.getByText("publication.published", { exact: true }).first(),
    ).toBeVisible();
    await reviewer.goto(`${origin}/comics?search=${encodeURIComponent(title)}`);
    await expect(
      reviewer.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      (
        await admin.request.post(`/api/admin/content/${id}`, {
          headers: { origin: adminOrigin },
          data: {
            version: 10,
            reason:
              "Browser verification complete; hide the temporary fixture.",
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/studio");
    await page.screenshot({
      path: "test-results/next-studio.png",
      fullPage: true,
      caret: "initial",
    });
    await reviewer.goto("/admin");
    await reviewer.screenshot({
      path: "test-results/next-admin.png",
      fullPage: true,
      caret: "initial",
    });
  } finally {
    await author.close();
    await admin.close();
    await other.close();
  }
});
