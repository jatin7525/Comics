import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MongoClient } from "mongodb";
import { chromium } from "@playwright/test";
const origins = {
  reader: "http://localhost:3100",
  studio: "http://localhost:3101",
  admin: "http://localhost:3102",
};
const password = process.env.SEED_PASSWORD;
if (!password || process.env.STORAGE_DRIVER !== "local")
  throw new Error(
    "Local seeded accounts required; no catalog is seeded by this test.",
  );
// Reset only local test identities so repeated verification does not exhaust sign-in budgets.
const uri = process.env.MONGODB_URI ?? "";
if (
  !uri.startsWith("mongodb://127.0.0.1:27028/") ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Local database required.");
const client = new MongoClient(uri);
try {
  const identity = createHmac("sha256", process.env.RATE_LIMIT_SECRET)
    .update("local")
    .digest("hex");
  await client
    .db(process.env.MONGODB_DATABASE)
    .collection("rateLimits")
    .deleteMany({
      _id: { $regex: `^(reader|studio|admin):auth:10:600:${identity}:` },
    });
} finally {
  await client.close();
}
async function request(
  service,
  path,
  { method = "GET", data, cookie, origin } = {},
) {
  return fetch(origins[service] + path, {
    method,
    redirect: "manual",
    headers: {
      ...(method !== "GET"
        ? {
            Origin: origin ?? origins[service],
            "Content-Type": "application/json",
          }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function login(service, account, status = 200) {
  const response = await request(service, "/api/auth/login", {
    method: "POST",
    data: { email: `${account}@astra.test`, password },
  });
  assert.equal(response.status, status, `${service}: ${account} sign-in`);
  return response.headers.get("set-cookie")?.split(";")[0];
}
for (const [service, paths] of Object.entries({
  reader: ["/studio", "/admin", "/api/publications", "/api/admin/policies"],
  studio: ["/admin", "/api/admin/policies", "/register", "/api/auth/register"],
  admin: ["/studio", "/api/publications", "/register", "/api/auth/register"],
})) {
  for (const path of paths)
    assert.equal(
      (
        await request(
          service,
          path,
          path.startsWith("/api/") ? { method: "POST", data: {} } : {},
        )
      ).status,
      404,
      `${service} must not contain ${path}`,
    );
}
await login("studio", "reader", 403);
await login("admin", "reader", 403);
await login("admin", "author", 403);
const readerCookie = await login("reader", "admin");
const studioCookie = await login("studio", "author");
const adminCookie = await login("admin", "admin");
assert.match(readerCookie, /^astra_reader_session=/);
assert.match(studioCookie, /^astra_studio_session=/);
assert.match(adminCookie, /^astra_admin_session=/);
for (const cookie of [readerCookie, studioCookie]) {
  const replay = `astra_admin_session=${cookie.split("=")[1]}`;
  assert.equal(
    (
      await request("admin", "/api/admin/policies", {
        method: "PATCH",
        data: {},
        cookie: replay,
      })
    ).status,
    401,
    "Token replay must fail even after renaming the cookie",
  );
}
assert.equal(
  (
    await request("admin", "/api/admin/policies", {
      method: "PATCH",
      data: {},
      cookie: adminCookie,
      origin: origins.reader,
    })
  ).status,
  403,
);
assert.equal(
  (
    await request("admin", "/api/admin/policies", {
      method: "PATCH",
      data: {},
      cookie: adminCookie,
    })
  ).status,
  400,
  "Authenticated request reaches payload validation",
);
assert.equal(
  (
    await request("studio", "/api/publications", {
      method: "POST",
      data: {},
      cookie: studioCookie,
    })
  ).status,
  400,
);
for (const [service, path, cookie] of [
  ["studio", "/studio", studioCookie],
  ["admin", "/admin", adminCookie],
]) {
  const anonymous = await request(service, path);
  assert.ok(
    anonymous.status === 307 ||
      (anonymous.status === 200 &&
        (await anonymous.text()).includes("NEXT_REDIRECT")),
    "Anonymous workspace request must redirect before rendering protected data",
  );
  assert.equal((await request(service, path, { cookie })).status, 200);
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const service of Object.keys(origins)) {
    await page.goto(origins[service] + "/login");
    await page.locator(".auth-card").waitFor();
    assert.equal(await page.locator(".sidebar, .topbar").count(), 0);
    assert.equal(
      await page.getByText("New here? Create an account").count(),
      service === "reader" ? 1 : 0,
    );
  }
  await page.goto(origins.reader);
  for (const label of ["Art gallery", "All comics", "Discover"]) {
    await page
      .locator(".sidebar")
      .getByRole("link", { name: label, exact: true })
      .click();
    await page.locator("h1:visible").waitFor();
  }
  for (const [service, cookie, heading] of [
    ["studio", studioCookie, "Your stories are finding their people."],
    ["admin", adminCookie, "A healthy platform starts here."],
  ]) {
    const [name, value] = cookie.split("=");
    await page
      .context()
      .addCookies([
        { name, value, url: origins[service], httpOnly: true, sameSite: "Lax" },
      ]);
    await page.goto(origins[service] + `/${service}`);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".workspace-link")
        .filter({ hasText: "Reader platform" })
        .getAttribute("href"),
      origins.reader,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `test-results/separate-${service}.png`,
      fullPage: true,
      caret: "initial",
    });
  }
  assert.deepEqual(errors, [], "No runtime errors during navigation");
} finally {
  await browser.close();
}
for (const [service, cookie] of [
  ["reader", readerCookie],
  ["studio", studioCookie],
  ["admin", adminCookie],
])
  await request(service, "/api/auth/logout", { method: "POST", cookie });
console.log(
  "Service isolation passed: absent routes, role gates, audience replay, CSRF, authenticated workspaces, standalone login, and reader navigation. Catalog unchanged.",
);
