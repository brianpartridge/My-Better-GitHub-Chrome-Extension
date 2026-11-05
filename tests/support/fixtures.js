// Starts Chromium with the real extension loaded from the repository, and
// gives each test a new page on a fake github.com. Each worker keeps one
// browser, because a start takes seconds.

const path = require("node:path");
const { test: base, expect, chromium } = require("@playwright/test");
const { FakeGitHub, diffId } = require("./fake-github");

const EXTENSION = path.resolve(__dirname, "../..");

function launchWithExtension() {
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
}

const test = base.extend({
  extensionContext: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const context = await launchWithExtension();
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await use(page);
    await page.close();
  },
  github: async ({ page }, use) => {
    const github = new FakeGitHub(page);
    await github.install();
    await use(github);
  },
});

// The diff and the tree row that are tagged as selected. A nested region must
// never get the tag, so this matches every tagged region.
async function expectSelected(page, filePath) {
  await expect(page.locator('[role="region"][data-mbg-selected]')).toHaveCount(1);
  await expect(page.locator('[role="region"][data-mbg-selected]')).toHaveAttribute("id", diffId(filePath));
  await expect(page.locator('li[role="treeitem"][data-mbg-selected]')).toHaveCount(1);
  await expect(page.locator('li[role="treeitem"][data-mbg-selected]')).toHaveAttribute("id", filePath);
}

async function expectNothingSelected(page) {
  await expect(page.locator("[data-mbg-selected]")).toHaveCount(0);
}

// A tree row, found by its path. Paths contain characters that CSS treats as
// syntax, so this matches the attribute.
function treeRow(page, filePath) {
  return page.locator(`li[role="treeitem"][id="${filePath}"]`);
}

// The row's own label, not the rows inside a directory row.
function treeRowLabel(page, filePath) {
  return treeRow(page, filePath).locator(
    ":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content-text"
  );
}

function region(page, filePath) {
  return page.locator(`[role="region"][id="${diffId(filePath)}"]`).first();
}

module.exports = {
  test,
  expect,
  launchWithExtension,
  expectSelected,
  expectNothingSelected,
  treeRow,
  treeRowLabel,
  region,
};
