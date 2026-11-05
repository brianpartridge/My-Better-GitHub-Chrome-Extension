// Checks the real github.com, to catch the case where GitHub changes its page
// and the fake page no longer matches. Run `npm run test:live:login` once
// first. These tests read only. They never press v, so they don't change the
// Viewed state of your account.

const fs = require("node:fs");
const { test, expect, launchWithExtension } = require("../support/fixtures");
const { AUTH_FILE } = require("./auth-file");
const { readContract } = require("./contract");

// A merged public PR with directories in its file tree.
const PR_URL = "https://github.com/react/react/pull/37778/changes";

test.skip(!fs.existsSync(AUTH_FILE), "No saved session. Run npm run test:live:login.");

test.describe.configure({ mode: "serial" });

let context;
let page;

test.beforeAll(async () => {
  context = await launchWithExtension();
  await context.addCookies(JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")).cookies);
  page = await context.newPage();
  await page.goto(PR_URL);
  await page
    .locator('button[aria-pressed][aria-label="Viewed"], button[aria-pressed][aria-label="Not Viewed"]')
    .first()
    .waitFor();
});

test.afterAll(async () => {
  await context?.close();
});

test("GitHub's page matches what the extension expects", async () => {
  const contract = await page.evaluate(readContract);
  expect(contract.path, "GitHub serves the classic view if the session has expired").toMatch(/\/pull\/\d+\/changes$/);
  expect(contract.fileRows).toBeGreaterThan(0);
  expect(contract.directoryRows).toBeGreaterThan(0);
  expect(contract.directoryRowContainsChildren).toBe(true);
  expect(contract.fileRowProblems).toEqual([]);
  expect(contract.regions).toBeGreaterThan(0);
  expect(contract.loadedRegions).toBeGreaterThan(0);
  expect(contract.regionProblems).toEqual([]);
  expect(["Viewed", "Not Viewed"]).toContain(contract.viewedButtonLabel);
  expect(contract.hasEmbeddedDiffSummaries).toBe(true);
  expect(contract.tabLinks).toBe(4);
});

test("the extension marks the tabs and the file tree", async () => {
  await expect(page.locator("a[data-mbg-key]").first()).toBeAttached();
  await expect(page.locator('[role="tree"] li[data-prv-state]').first()).toBeAttached();
});

test("a click on a file in the tree selects it, and j moves on", async () => {
  const row = page.locator('[role="tree"] li[role="treeitem"]:not([aria-expanded])').nth(1);
  const path = await row.getAttribute("id");
  await row.locator(":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content-text").click();
  await expect(row).toHaveAttribute("data-mbg-selected", "");

  await page.keyboard.press("j");
  await expect(row).not.toHaveAttribute("data-mbg-selected", "");
  const selected = page.locator('[role="tree"] li[data-mbg-selected]');
  await expect(selected).toHaveCount(1);
  expect(await selected.getAttribute("id")).not.toBe(path);
});
