const { test, expect, treeRow, region } = require("./support/fixtures");

const FILES = [
  { path: "README.md", viewed: true },
  { path: "src/a.js", viewed: true },
  { path: "src/b.js" },
  { path: "src/lib/c.js", state: "loading" },
  { path: "docs/one.md", viewed: true },
  { path: "docs/two.md", viewed: true },
];

// What the row draws on the right, from viewed-tree.css.
function drawnMark(page, filePath) {
  return treeRow(page, filePath)
    .locator(":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content")
    .evaluate((el) => getComputedStyle(el, "::after").content);
}

test("file rows show their viewed state", async ({ page, github }) => {
  await github.openChanges(FILES);
  await expect(treeRow(page, "README.md")).toHaveAttribute("data-prv-state", "viewed");
  await expect(treeRow(page, "src/b.js")).toHaveAttribute("data-prv-state", "unviewed");
  expect(await drawnMark(page, "README.md")).toBe('"✓"');
  expect(await drawnMark(page, "src/b.js")).toBe('"○"');
});

test("directory rows count every file below them, loaded or not", async ({ page, github }) => {
  await github.openChanges(FILES);
  await expect(treeRow(page, "src")).toHaveAttribute("data-prv-state", "partial");
  await expect(treeRow(page, "src/lib")).toHaveAttribute("data-prv-state", "unviewed");
  await expect(treeRow(page, "docs")).toHaveAttribute("data-prv-state", "viewed");
  expect(await drawnMark(page, "src")).toBe('"1/3"');
  expect(await drawnMark(page, "src/lib")).toBe('"0/1"');
  expect(await drawnMark(page, "docs")).toBe('"✓ 2/2"');
});

test("a viewed row is dimmed, but its children are not", async ({ page, github }) => {
  await github.openChanges(["dir/a.js", { path: "b.js", viewed: true }]);
  const opacity = (filePath) =>
    treeRow(page, filePath)
      .locator(":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content-text")
      .evaluate((el) => getComputedStyle(el).opacity);
  await expect(treeRow(page, "b.js")).toHaveAttribute("data-prv-state", "viewed");
  expect(await opacity("b.js")).toBe("0.5");
  expect(await opacity("dir/a.js")).toBe("1");
});

test("the tree follows the Viewed button", async ({ page, github }) => {
  await github.openChanges(FILES);
  await expect(treeRow(page, "src")).toHaveAttribute("data-prv-state", "partial");

  await region(page, "src/b.js").getByRole("button").click();
  await expect(treeRow(page, "src/b.js")).toHaveAttribute("data-prv-state", "viewed");
  await expect.poll(() => drawnMark(page, "src")).toBe('"2/3"');

  await region(page, "src/b.js").getByRole("button").click();
  await expect(treeRow(page, "src/b.js")).toHaveAttribute("data-prv-state", "unviewed");
  await expect.poll(() => drawnMark(page, "src")).toBe('"1/3"');
});

test("the shortcut v also updates the tree", async ({ page, github }) => {
  await github.openChanges(["a.js", "b.js"]);
  await expect(treeRow(page, "a.js")).toHaveAttribute("data-prv-state", "unviewed");
  await page.keyboard.press("v");
  await expect(treeRow(page, "a.js")).toHaveAttribute("data-prv-state", "viewed");
});

test("without embedded data, the state comes from a fetch of the page", async ({ page, github }) => {
  await github.openChanges(FILES, { embeddedData: "fetch-only" });
  await expect(page.locator('script[data-target="react-app.embeddedData"]')).toHaveCount(0);
  await expect(treeRow(page, "src/lib/c.js")).toHaveAttribute("data-prv-state", "unviewed");
  await expect(treeRow(page, "docs")).toHaveAttribute("data-prv-state", "viewed");
});

test("with no embedded data at all, the live buttons still paint the tree", async ({ page, github }) => {
  await github.openChanges(FILES, { embeddedData: "never" });
  await expect(treeRow(page, "README.md")).toHaveAttribute("data-prv-state", "viewed");
  await expect(treeRow(page, "src/b.js")).toHaveAttribute("data-prv-state", "unviewed");
  await expect(treeRow(page, "src/lib/c.js")).not.toHaveAttribute("data-prv-state", /.*/);
});

test("the extension adds no elements to the tree", async ({ page, github }) => {
  await github.openChanges(["a.js"], { embeddedData: "always" });
  await expect(treeRow(page, "a.js")).toHaveAttribute("data-prv-state", "unviewed");
  await expect(page.locator("#tree > li")).toHaveCount(1);
  await expect(treeRow(page, "a.js").locator("[data-prv-state]")).toHaveCount(0);
});
