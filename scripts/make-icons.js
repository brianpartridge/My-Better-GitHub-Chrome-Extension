// Draws the extension icon and writes every PNG that Chrome, Safari, and the
// Safari app need. Run it after you change the drawing:
//
//   npm run icons
//
// The icon is a dark key cap with a green check mark: the key badges on the PR
// tabs, and the Viewed mark in the file tree. Chromium renders the SVG, since
// Playwright is already a dev dependency.

/* global requestAnimationFrame -- used inside page.evaluate, which runs in the browser */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const EXTENSION_ICONS = path.join(ROOT, "extension/icons");
const APP = path.join(ROOT, "safari/My Better GitHub");
const APP_ICON_SET = path.join(APP, "Assets.xcassets/AppIcon.appiconset");

// Sizes the manifest lists. Chrome reads 16 to 128. Safari reads 48 to 512.
const EXTENSION_SIZES = [16, 32, 48, 64, 96, 128, 256, 512];
// macOS app icon slots, as points and scale.
const APP_ICON_SLOTS = [16, 32, 128, 256, 512].flatMap((pt) => [[pt, 1], [pt, 2]]);
// Apple's app icon grid leaves 100 of 1024 clear on each side.
const APP_INSET = 100 / 1024;

// `inset` is the fraction of the canvas left clear on each side. The browser
// icon fills its canvas. The app icon keeps Apple's margins.
function iconSvg(size, inset) {
  const side = size * (1 - 2 * inset);
  const x = size * inset;
  const y = x;
  const edge = side * 0.07; // The key cap's visible lower edge.
  const faceH = side - edge;
  const r = side * 0.2237; // Apple's corner ratio, so the app icon matches other macOS icons.
  const rim = side * 0.02;
  const check = side * 0.13;
  const p = (fx, fy) => `${x + side * fx},${y + faceH * fy}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${x}" y="${y + edge}" width="${side}" height="${faceH}" rx="${r}" fill="#0d1117"/>
  <rect x="${x}" y="${y}" width="${side}" height="${faceH}" rx="${r}" fill="#24292f"/>
  <rect x="${x + rim / 2}" y="${y + rim / 2}" width="${side - rim}" height="${faceH - rim}" rx="${r - rim / 2}" fill="none" stroke="#6e7781" stroke-width="${rim}"/>
  <polyline points="${p(0.27, 0.53)} ${p(0.43, 0.7)} ${p(0.75, 0.34)}" fill="none" stroke="#3fb950" stroke-width="${check}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

// Each render gets its own page sized to the icon. A reused page can capture
// a stale frame right after a viewport change, which tiles the image.
async function render(browser, svg, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
  console.log(path.relative(ROOT, file));
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium" });

  for (const size of EXTENSION_SIZES) {
    await render(browser, iconSvg(size, 0), size, path.join(EXTENSION_ICONS, `icon-${size}.png`));
  }

  const images = [];
  for (const [pt, scale] of APP_ICON_SLOTS) {
    const filename = `mac-icon-${pt}@${scale}x.png`;
    await render(browser, iconSvg(pt * scale, APP_INSET), pt * scale, path.join(APP_ICON_SET, filename));
    images.push({ filename, idiom: "mac", scale: `${scale}x`, size: `${pt}x${pt}` });
  }
  fs.writeFileSync(
    path.join(APP_ICON_SET, "Contents.json"),
    JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2) + "\n",
  );

  // The app's one window shows this at 128 points.
  await render(browser, iconSvg(384, APP_INSET), 384, path.join(APP, "Resources/Icon.png"));

  const svgFile = path.join(ROOT, "docs/icon.svg");
  fs.writeFileSync(svgFile, iconSvg(128, 0));
  console.log(path.relative(ROOT, svgFile));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
