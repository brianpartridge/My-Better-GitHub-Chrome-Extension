const {
  test,
  expect,
  expectSelected,
  expectNothingSelected,
  treeRow,
  treeRowLabel,
  region,
} = require("./support/fixtures");

const FILES = ["a.js", "b.js", "c.js", "d.js"];

// The distance from the sticky page header to the top of the file's diff.
function offsetBelowHeader(page, filePath) {
  return region(page, filePath).evaluate((el) => el.getBoundingClientRect().top - 60);
}

// file-nav.js accepts 1 pixel of difference when it pins a file.
async function expectPinned(page, filePath) {
  await expect.poll(async () => Math.abs(await offsetBelowHeader(page, filePath))).toBeLessThanOrEqual(1);
}

test.describe("j and k", () => {
  test("the first press selects the file at the top of the screen", async ({ page, github }) => {
    await github.openChanges(FILES);
    await expectNothingSelected(page);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
  });

  test("the first press starts from where you scrolled to", async ({ page, github }) => {
    await github.openChanges(FILES);
    await region(page, "c.js").evaluate((el) => el.scrollIntoView());
    await page.mouse.wheel(0, 200);
    await expect.poll(() => offsetBelowHeader(page, "c.js")).toBeLessThan(0);
    await page.keyboard.press("k");
    await expectSelected(page, "c.js");
  });

  test("j and k move through the files, and scroll to them", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await expectSelected(page, "b.js");
    await page.keyboard.press("j");
    await expectSelected(page, "c.js");
    await expectPinned(page, "c.js");
    await page.keyboard.press("k");
    await expectSelected(page, "b.js");
    await expectPinned(page, "b.js");
  });

  test("k stays on the first file", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await expectSelected(page, "a.js");
  });

  test("j selects a file that appears after the last rendered file", async ({ page, github }) => {
    await github.openChanges(["a.js", { path: "b.js", state: "absent" }]);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
    await github.mount("b.js");
    await expectSelected(page, "b.js");
  });

  test("another key ends the wait for the next file", async ({ page, github }) => {
    await github.openChanges(["a.js", { path: "b.js", state: "absent" }]);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("Escape");
    await github.mount("b.js");
    await expect(region(page, "b.js")).toBeAttached();
    await page.waitForTimeout(100);
    await expectSelected(page, "a.js");
  });
});

test.describe("v", () => {
  test("marks the selected file, selects the next, and pins the viewed file", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["b.js"]);
    await expectSelected(page, "c.js");
    await expect(region(page, "b.js").locator(".fake-body")).toHaveCount(0);
    await expectPinned(page, "b.js");
  });

  test("with no selection, marks the file at the top of the screen", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["a.js"]);
    await expectSelected(page, "b.js");
  });

  test("removes the mark, and keeps the selection", async ({ page, github }) => {
    await github.openChanges([{ path: "a.js", viewed: true }, "b.js"]);
    await page.keyboard.press("j");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual([]);
    await expectSelected(page, "a.js");
  });

  test("on the last rendered file, keeps it selected until the next appears", async ({ page, github }) => {
    await github.openChanges(["a.js", { path: "b.js", state: "absent" }]);
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["a.js"]);
    await expectSelected(page, "a.js");
    await github.mount("b.js");
    await expectSelected(page, "b.js");
  });

  test("does nothing on a file that is loading", async ({ page, github }) => {
    await github.openChanges([{ path: "a.js", state: "loading" }, "b.js"]);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual([]);
    await expectSelected(page, "a.js");
  });
});

test.describe("clicks", () => {
  test("a click inside a diff selects that file", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await region(page, "b.js").locator("h3").click();
    await expectSelected(page, "b.js");
    await page.keyboard.press("j");
    await expectSelected(page, "c.js");
  });

  test("v marks the file clicked in the tree, not the old selection", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
    await treeRowLabel(page, "c.js").click();
    await expectSelected(page, "c.js");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["c.js"]);
    await expectSelected(page, "d.js");
  });

  test("j and k continue from the file clicked in the tree", async ({ page, github }) => {
    await github.openChanges(FILES);
    await treeRowLabel(page, "b.js").click();
    await page.keyboard.press("j");
    await expectSelected(page, "c.js");
    await treeRowLabel(page, "b.js").click();
    await page.keyboard.press("k");
    await expectSelected(page, "a.js");
  });

  test("Enter and Space on a focused file row select the file", async ({ page, github }) => {
    await github.openChanges(FILES);
    await treeRow(page, "b.js").focus();
    await page.keyboard.press("Enter");
    await expectSelected(page, "b.js");
    await treeRow(page, "d.js").focus();
    await page.keyboard.press("Space");
    await expectSelected(page, "d.js");
  });

  test("a click on a file in a directory selects that file", async ({ page, github }) => {
    await github.openChanges(["src/a.js", "src/b.js"]);
    await treeRowLabel(page, "src/b.js").click();
    await expectSelected(page, "src/b.js");
  });

  test("a directory row does not select its first child", async ({ page, github }) => {
    await github.openChanges(["src/a.js", "src/b.js"]);
    await treeRowLabel(page, "src").click();
    await expect(treeRow(page, "src")).toHaveAttribute("aria-expanded", "false");
    await expectNothingSelected(page);
    await treeRow(page, "src").focus();
    await page.keyboard.press("Enter");
    await expect(treeRow(page, "src")).toHaveAttribute("aria-expanded", "true");
    await expectNothingSelected(page);
  });
});

test.describe("diffs that are not ready", () => {
  test("j, k and v wait for the diff of a file clicked in the tree", async ({ page, github }) => {
    await github.openChanges(["a.js", "b.js", { path: "c.js", state: "absent" }]);
    await page.keyboard.press("j");
    await treeRowLabel(page, "c.js").click();
    await expect(treeRow(page, "c.js")).toHaveAttribute("data-mbg-selected", "");
    for (const key of ["v", "j", "k"]) await page.keyboard.press(key);
    expect(await github.viewedPaths()).toEqual([]);
    await expect(treeRow(page, "c.js")).toHaveAttribute("data-mbg-selected", "");
    await expect(page.locator('[role="region"][data-mbg-selected]')).toHaveCount(0);

    await github.mount("c.js");
    await expectSelected(page, "c.js");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["c.js"]);
  });

  test("the keys work again if the clicked diff never appears", async ({ page, github }) => {
    test.slow();
    await github.openChanges(["a.js", { path: "b.js", state: "absent" }]);
    await treeRowLabel(page, "b.js").click();
    await page.waitForTimeout(10200);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
  });

  test("the keys are not held when a selected diff unmounts after you scroll", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.keyboard.press("j");
    await treeRowLabel(page, "c.js").click();
    await expectSelected(page, "c.js");
    await github.unmount("c.js");
    await page.mouse.wheel(0, -100000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
  });

  test("the selection survives when GitHub replaces the loading diff", async ({ page, github }) => {
    await github.openChanges([{ path: "a.js", state: "loading" }, "b.js"]);
    await page.keyboard.press("j");
    await expectSelected(page, "a.js");
    await github.finishLoading("a.js");
    await expect(region(page, "a.js").locator("button")).toBeAttached();
    await expectSelected(page, "a.js");
    await page.keyboard.press("v");
    expect(await github.viewedPaths()).toEqual(["a.js"]);
    await expectSelected(page, "b.js");
  });

  test("a nested loading region does not count as a file", async ({ page, github }) => {
    await github.openChanges([{ path: "a.js", state: "loading" }, "b.js"]);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await expectSelected(page, "b.js");
    await page.keyboard.press("k");
    await expectSelected(page, "a.js");
  });
});

test.describe("when the keys are ignored", () => {
  test("while you type", async ({ page, github }) => {
    await github.openChanges(FILES);
    await page.locator("#comment").click();
    await page.keyboard.type("jkv");
    await expect(page.locator("#comment")).toHaveValue("jkv");
    await expectNothingSelected(page);
    expect(await github.viewedPaths()).toEqual([]);
  });

  test("with a modifier key", async ({ page, github }) => {
    await github.openChanges(FILES);
    for (const key of ["Control+j", "Meta+j", "Alt+v"]) await page.keyboard.press(key);
    await expectNothingSelected(page);
    expect(await github.viewedPaths()).toEqual([]);
  });

  test("on other PR tabs", async ({ page, github }) => {
    await github.open("/o/r/pull/1/commits", { files: FILES });
    await page.keyboard.press("j");
    await page.keyboard.press("v");
    await expectNothingSelected(page);
    expect(await github.viewedPaths()).toEqual([]);
  });
});

test("the selection does not carry over to another PR", async ({ page, github }) => {
  await github.openChanges(FILES);
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expectSelected(page, "b.js");
  await page.evaluate(() => history.pushState(null, "", "/o/r/pull/2/changes"));
  // A wheel event ends the pin from the last key press, so the scroll stays.
  await page.mouse.wheel(0, -100000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("j");
  await expectSelected(page, "a.js");
});

test("the selected file and its tree row are visibly marked", async ({ page, github }) => {
  await github.openChanges(FILES);
  await page.keyboard.press("j");
  await expectSelected(page, "a.js");
  const frame = await region(page, "a.js").evaluate((el) => getComputedStyle(el, "::after").borderTopWidth);
  expect(frame).toBe("3px");
  const background = await treeRow(page, "a.js")
    .locator(":scope > .PRIVATE_TreeView-item-container")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
});
