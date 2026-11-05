const { test, expect } = require("./support/fixtures");

const PR = "/o/r/pull/1";

function tab(page, href) {
  return page.locator(`#tabs a[href="${href}"]`);
}

function pathname(page) {
  return new URL(page.url()).pathname;
}

test("keys 1 to 4 click the tab links", async ({ page, github }) => {
  await github.open(PR);
  let count = 0;
  for (const [key, suffix] of [
    ["4", "/changes"],
    ["3", "/checks"],
    ["2", "/commits"],
    ["1", ""],
  ]) {
    await page.keyboard.press(key);
    await expect.poll(() => pathname(page)).toBe(PR + suffix);
    expect(await github.softNavigations()).toBe(++count);
  }
});

test("the classic tab markup also works", async ({ page, github }) => {
  await github.open(PR, { tabStyle: "classic" });
  await expect(tab(page, `${PR}/commits`)).toHaveAttribute("data-mbg-key", "2");
  await page.keyboard.press("2");
  await expect.poll(() => pathname(page)).toBe(`${PR}/commits`);
  expect(await github.softNavigations()).toBe(1);
});

test("with no tab links, the key navigates to the tab's URL", async ({ page, github }) => {
  await github.open(PR, { tabStyle: "none" });
  await page.locator("#tree").waitFor({ state: "attached" });
  await page.waitForFunction(() => document.readyState === "complete");
  await expect(async () => {
    await page.keyboard.press("3");
    expect(pathname(page)).toBe(`${PR}/checks`);
  }).toPass();
});

test("a key does nothing on the tab you are on", async ({ page, github }) => {
  for (const [key, path] of [
    ["1", PR],
    ["4", `${PR}/changes`],
    ["4", `${PR}/changes/abc123`],
    ["4", `${PR}/files`],
  ]) {
    await github.open(path);
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    expect(pathname(page)).toBe(path);
    expect(await github.softNavigations()).toBe(0);
  }
});

test("key 1 leaves a sub-page of another tab", async ({ page, github }) => {
  await github.open(`${PR}/changes/abc123`);
  await page.keyboard.press("1");
  await expect.poll(() => pathname(page)).toBe(PR);
});

test("keys are ignored while you type, with a modifier, and outside a PR", async ({ page, github }) => {
  await github.open(PR);
  await page.locator("#comment").click();
  await page.keyboard.type("4");
  await expect(page.locator("#comment")).toHaveValue("4");
  await page.locator("#comment").blur();
  await page.keyboard.press("Alt+4");
  await page.waitForTimeout(50);
  expect(pathname(page)).toBe(PR);

  await github.open("/o/r/issues");
  await page.keyboard.press("4");
  await page.waitForTimeout(50);
  expect(pathname(page)).toBe("/o/r/issues");
});

test("each tab gets a key badge", async ({ page, github }) => {
  await github.open(PR);
  for (const [key, suffix] of [
    ["1", ""],
    ["2", "/commits"],
    ["3", "/checks"],
    ["4", "/changes"],
  ]) {
    await expect(tab(page, PR + suffix)).toHaveAttribute("data-mbg-key", key);
  }
  const badge = await tab(page, `${PR}/changes`).evaluate((el) => getComputedStyle(el, "::after").content);
  expect(badge).not.toBe("none");
});
