// Checks image diffs on the real github.com: the shape of GitHub's image
// viewer that image-diff.js and tests/support/fake-github-page.js depend on,
// and the extension's bar on it. Reads only.

const fs = require("node:fs");
const { test, expect, launchWithExtension } = require("../support/fixtures");
const { AUTH_FILE } = require("./auth-file");

// A merged public PR that changes PNG snapshots, stored in git, not LFS.
const PR_URL = "https://github.com/pointfreeco/swift-snapshot-testing/pull/1064/changes";
const VIEWER = '[data-type="img"] iframe[src^="https://viewscreen.githubusercontent.com/"]';

test.skip(!fs.existsSync(AUTH_FILE), "No saved session. Run npm run test:live:login.");

test.describe.configure({ mode: "serial" });

let context;
let page;

test.beforeAll(async () => {
  context = await launchWithExtension();
  await context.addCookies(JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")).cookies);
  page = await context.newPage();
  await page.goto(PR_URL);
  await page.locator(`iframe[src*="enc_url1="]`).first().waitFor({ state: "attached" });
});

test.afterAll(async () => {
  await context?.close();
});

test("GitHub's image viewer matches what the extension expects", async () => {
  const viewer = await page.locator(`${VIEWER}[src*="enc_url1="]`).first().evaluate((iframe) => {
    const fromHex = (hex) => new TextDecoder().decode(new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16))));
    const params = new URL(iframe.src).searchParams;
    const viewport = iframe.closest('[data-type="img"]');
    return {
      urls: [params.get("enc_url1"), params.get("enc_url2")].map(fromHex),
      inRegion: Boolean(viewport.parentElement?.closest('[role="region"][id^="diff-"]')),
    };
  });
  for (const url of viewer.urls) expect(url).toMatch(/^https:\/\/[^/]+\.githubusercontent\.com\//);
  expect(viewer.urls[0]).not.toBe(viewer.urls[1]);
  expect(viewer.inRegion).toBe(true);
});

test("the extension adds a pixel diff that reads both images", async () => {
  const region = page.locator('[role="region"][id^="diff-"]').filter({ has: page.locator(`${VIEWER}[src*="enc_url1="]`) }).first();
  await region.scrollIntoViewIfNeeded();
  const bar = region.locator(".mbg-image-tools");
  await bar.getByRole("button", { name: "Pixel diff" }).click();
  await expect(bar.getByRole("status")).toHaveText(/pixels? differ/);
  await expect(bar.getByRole("status")).not.toHaveText(/Could not load/);
});

test("Reload images loads GitHub's viewer again", async () => {
  const region = page.locator('[role="region"][id^="diff-"]').filter({ has: page.locator(`${VIEWER}[src*="enc_url1="]`) }).first();
  const reloaded = page.waitForEvent("framenavigated", (frame) => frame.url().startsWith("https://viewscreen.githubusercontent.com/"));
  await region.locator(".mbg-image-tools").getByRole("button", { name: "Reload images" }).click();
  await reloaded;
  await expect(region.locator(VIEWER)).toHaveCount(1);
});
