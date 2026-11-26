const { test, expect, region } = require("./support/fixtures");
const { solid, withPixels } = require("./support/png");

const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const RED = [255, 0, 0, 255];
const HIGHLIGHT = [255, 0, 150, 255];

const BEFORE = solid(40, 40, WHITE);
const AFTER = withPixels(BEFORE, [
  [10, 20, BLACK],
  [12, 22, RED],
]);

function changedImage(path, image = { before: BEFORE, after: AFTER }) {
  return { path, image };
}

function bar(page, filePath) {
  return region(page, filePath).locator(".mbg-image-tools");
}

function pixelDiffButton(page, filePath) {
  return bar(page, filePath).getByRole("button", { name: "Pixel diff" });
}

function status(page, filePath) {
  return bar(page, filePath).getByRole("status");
}

function viewButton(page, filePath, name) {
  return bar(page, filePath).getByRole("group", { name: "Pixel diff view" }).getByRole("button", { name });
}

// The color of a pixel of the pixel diff, as [r, g, b, a].
function canvasPixel(page, filePath, x, y) {
  return bar(page, filePath)
    .locator("canvas")
    .evaluate((canvas, [px, py]) => [...canvas.getContext("2d").getImageData(px, py, 1, 1).data], [x, y]);
}

async function openPixelDiff(page, filePath) {
  await pixelDiffButton(page, filePath).click();
  await expect(status(page, filePath)).not.toHaveText(/Comparing/);
}

test("a changed image gets a bar with Pixel diff and Reload images", async ({ page, github }) => {
  await github.openChanges(["a.js", changedImage("a.png")]);
  await expect(pixelDiffButton(page, "a.png")).toHaveAttribute("aria-expanded", "false");
  await expect(bar(page, "a.png").getByRole("button", { name: "Reload images" })).toBeVisible();
  // The bar goes right after GitHub's viewer.
  await expect(region(page, "a.png").locator(".FileRendererWrapper__fake + .mbg-image-tools")).toHaveCount(1);
  await expect(region(page, "a.js").locator(".mbg-image-tools")).toHaveCount(0);
});

test("an added image gets Reload images, but no pixel diff", async ({ page, github }) => {
  await github.openChanges([{ path: "new.png", image: { after: AFTER } }]);
  await expect(bar(page, "new.png").getByRole("button", { name: "Reload images" })).toBeVisible();
  await expect(pixelDiffButton(page, "new.png")).toHaveCount(0);
});

test("the pixel diff counts and highlights each changed pixel", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png")]);
  await openPixelDiff(page, "a.png");
  await expect(pixelDiffButton(page, "a.png")).toHaveAttribute("aria-expanded", "true");
  await expect(status(page, "a.png")).toHaveText("2 of 1,600 pixels differ (0.13%).");
  await expect(viewButton(page, "a.png", "Highlight")).toHaveAttribute("aria-pressed", "true");

  expect(await canvasPixel(page, "a.png", 10, 20)).toEqual(HIGHLIGHT);
  expect(await canvasPixel(page, "a.png", 12, 22)).toEqual(HIGHLIGHT);
  // Unchanged pixels are faded, here white on white. Inside the box, too.
  expect(await canvasPixel(page, "a.png", 11, 21)).toEqual(WHITE);
  expect(await canvasPixel(page, "a.png", 0, 0)).toEqual(WHITE);
  // The box around the changes: a 2-pixel line, 4 pixels out from them.
  expect(await canvasPixel(page, "a.png", 5, 21)).toEqual(HIGHLIGHT);
  expect(await canvasPixel(page, "a.png", 6, 21)).toEqual(WHITE);
  expect(await canvasPixel(page, "a.png", 17, 21)).toEqual(HIGHLIGHT);
  expect(await canvasPixel(page, "a.png", 16, 21)).toEqual(WHITE);
});

test("an unchanged pixel shows as a faded gray", async ({ page, github }) => {
  const before = solid(10, 10, BLACK);
  const after = withPixels(before, [[9, 9, WHITE]]);
  await github.openChanges([changedImage("a.png", { before, after })]);
  await openPixelDiff(page, "a.png");
  const [r, g, b] = await canvasPixel(page, "a.png", 0, 0);
  expect(r).toBe(g);
  expect(g).toBe(b);
  expect(r).toBeGreaterThan(150);
  expect(r).toBeLessThan(255);
});

test("the views show the difference, the base image, and the head image", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png")]);
  await openPixelDiff(page, "a.png");

  await viewButton(page, "a.png", "Difference").click();
  await expect(viewButton(page, "a.png", "Difference")).toHaveAttribute("aria-pressed", "true");
  await expect(viewButton(page, "a.png", "Highlight")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => canvasPixel(page, "a.png", 0, 0)).toEqual(BLACK);
  expect(await canvasPixel(page, "a.png", 10, 20)).toEqual(WHITE);
  expect(await canvasPixel(page, "a.png", 12, 22)).toEqual([0, 255, 255, 255]);

  await viewButton(page, "a.png", "Before").click();
  await expect.poll(() => canvasPixel(page, "a.png", 10, 20)).toEqual(WHITE);

  await viewButton(page, "a.png", "After").click();
  await expect.poll(() => canvasPixel(page, "a.png", 10, 20)).toEqual(BLACK);
  expect(await canvasPixel(page, "a.png", 12, 22)).toEqual(RED);
});

test("identical images have no differences", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png", { before: BEFORE, after: BEFORE })]);
  await openPixelDiff(page, "a.png");
  await expect(status(page, "a.png")).toHaveText("No pixels differ.");
  expect(await canvasPixel(page, "a.png", 10, 20)).toEqual(WHITE);
});

test("images of different sizes are compared from the top-left corner", async ({ page, github }) => {
  const before = solid(4, 2, WHITE);
  const after = solid(2, 4, WHITE);
  await github.openChanges([changedImage("a.png", { before, after })]);
  await openPixelDiff(page, "a.png");
  // A 4 × 4 area. Only the top-left 2 × 2 pixels are in both images.
  await expect(status(page, "a.png")).toHaveText(
    "12 of 16 pixels differ (75%). The size changes from 4 × 2 to 2 × 4."
  );
  await expect(bar(page, "a.png").locator("canvas")).toHaveJSProperty("width", 4);
  await expect(bar(page, "a.png").locator("canvas")).toHaveJSProperty("height", 4);
});

test("an image that doesn't load shows an error", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png", { before: BEFORE, after: "missing" })]);
  await pixelDiffButton(page, "a.png").click();
  await expect(status(page, "a.png")).toHaveText("Could not load the images. Click Reload images to try again.");
});

test("a second click on Pixel diff closes it", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png")]);
  await openPixelDiff(page, "a.png");
  await pixelDiffButton(page, "a.png").click();
  await expect(pixelDiffButton(page, "a.png")).toHaveAttribute("aria-expanded", "false");
  await expect(bar(page, "a.png").locator(".mbg-pixel-diff")).toBeHidden();
});

test("Reload images loads GitHub's viewer again, in the same element", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png")]);
  await expect.poll(() => github.viewerLoadCount("a.png")).toBe(1);
  const iframe = region(page, "a.png").locator("iframe");
  await iframe.evaluate((el) => (el.dataset.testMark = "original"));

  await bar(page, "a.png").getByRole("button", { name: "Reload images" }).click();
  await expect.poll(() => github.viewerLoadCount("a.png")).toBe(2);
  await expect(iframe).toHaveAttribute("data-test-mark", "original");
  await expect(region(page, "a.png").locator("iframe")).toHaveCount(1);
});

test("Reload images also loads the pixel diff's images again", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png", { before: BEFORE, after: "missing" })]);
  await pixelDiffButton(page, "a.png").click();
  await expect(status(page, "a.png")).toHaveText(/Could not load/);

  await github.setImage("a.png", "after", AFTER);
  await bar(page, "a.png").getByRole("button", { name: "Reload images" }).click();
  await expect(status(page, "a.png")).toHaveText("2 of 1,600 pixels differ (0.13%).");
});

test("the pixel diff stays open when GitHub renders the diff again", async ({ page, github }) => {
  await github.openChanges(["a.js", changedImage("a.png")]);
  await openPixelDiff(page, "a.png");
  await viewButton(page, "a.png", "After").click();

  await github.unmount("a.png");
  await github.mount("a.png");
  await expect(pixelDiffButton(page, "a.png")).toHaveAttribute("aria-expanded", "true");
  await expect(viewButton(page, "a.png", "After")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => canvasPixel(page, "a.png", 10, 20)).toEqual(BLACK);
});

test("the bar goes away with GitHub's viewer", async ({ page, github }) => {
  await github.openChanges([changedImage("a.png")]);
  await expect(bar(page, "a.png")).toHaveCount(1);
  await region(page, "a.png").locator(".FileRendererWrapper__fake").evaluate((el) => el.remove());
  await expect(page.locator(".mbg-image-tools")).toHaveCount(0);
});

test("image diffs on other pages get no bar", async ({ page, github }) => {
  await github.open("/o/r/pull/1/commits", { files: [changedImage("a.png")] });
  await expect(region(page, "a.png").locator("iframe")).toBeAttached();
  await page.waitForTimeout(100);
  await expect(page.locator(".mbg-image-tools")).toHaveCount(0);
});
