// Adds a bar below each image diff on a PR's Files changed page:
//   Reload images  Loads GitHub's image viewer again, for when its images
//                  don't load. The rest of the page stays as it is.
//   Pixel diff     Compares the base and head images pixel by pixel, and
//                  shows each changed pixel, after the Kaleidoscope app.
//
// GitHub shows an image diff in an iframe from viewscreen.githubusercontent.com.
// The iframe's URL holds the image URLs as hex: enc_url1 is the base image
// and enc_url2 is the head image. An added or deleted image has only
// enc_url, so it gets the reload button but no pixel diff.
//
// The bar goes right after GitHub's viewer, inside the diff. GitHub can
// re-render or replace the diff at any time, so the bar is checked after DOM
// changes, and the pixel diff's state is kept by the viewer's URL.

const IMAGE_DIFF_PAGE = /^\/[^/]+\/[^/]+\/pull\/\d+\/(changes|files)(\/|$)/;
const VIEWER = '[data-type="img"] iframe[src^="https://viewscreen.githubusercontent.com/"]';
const BAR = "mbg-image-tools";
const MODES = [
  ["highlight", "Highlight"],
  ["difference", "Difference"],
  ["before", "Before"],
  ["after", "After"],
];

// Changed pixels, and the box around them. Unchanged pixels are a faded gray.
const HIGHLIGHT = [255, 0, 150];
const FADE = 0.3;

// Pixel diff state by viewer URL: { open, mode, result }, where result is
// the promise of the comparison.
const states = new Map();

let imageSyncScheduled = false;
new MutationObserver(scheduleImageSync).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["src"],
});
scheduleImageSync();

function scheduleImageSync() {
  if (imageSyncScheduled) return;
  imageSyncScheduled = true;
  requestAnimationFrame(() => {
    imageSyncScheduled = false;
    syncImageBars();
  });
}

// Gives each image viewer a bar, and removes bars whose viewer is gone. Only
// writes to the DOM when something is out of place, because each write
// triggers the observer again.
function syncImageBars() {
  if (!IMAGE_DIFF_PAGE.test(location.pathname)) return;

  for (const iframe of document.querySelectorAll(VIEWER)) {
    const urls = imageUrls(iframe.src);
    if (!urls) continue;
    const anchor = iframe.closest('[data-type="img"]').parentElement;
    if (!anchor?.parentElement) continue;
    const key = viewerKey(iframe.src);
    let bar = anchor.parentElement.querySelector(`:scope > .${BAR}`);
    if (bar && bar.dataset.mbgViewer !== key) {
      bar.remove();
      bar = null;
    }
    if (!bar) bar = buildBar(key, urls);
    if (anchor.nextElementSibling !== bar) anchor.after(bar);
  }

  for (const bar of document.querySelectorAll(`.${BAR}`)) {
    if (!viewerOf(bar)) bar.remove();
  }
}

// The viewer that the bar belongs to: the one right before it.
function viewerOf(bar) {
  return bar.previousElementSibling?.querySelector(VIEWER) || null;
}

// The viewer's URL without its hash, which only names the frame.
function viewerKey(src) {
  return src.split("#")[0];
}

// The image URLs in the viewer's URL: [base, head] for a changed image, or
// [image] for an added or deleted one. Only GitHub's own image hosts count.
function imageUrls(src) {
  let params;
  try {
    params = new URL(src).searchParams;
  } catch {
    return null;
  }
  const urls = params.has("enc_url1")
    ? [params.get("enc_url1"), params.get("enc_url2")].map(fromHex)
    : [fromHex(params.get("enc_url"))];
  return urls.every(isGitHubImageUrl) ? urls : null;
}

function fromHex(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

function isGitHubImageUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}

function stateFor(key) {
  if (!states.has(key)) states.set(key, { open: false, mode: "highlight", result: null });
  return states.get(key);
}

function element(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === "text") el.textContent = value;
    else el.setAttribute(name, value);
  }
  el.append(...children);
  return el;
}

function buildBar(key, urls) {
  const state = stateFor(key);
  const bar = element("div", { class: BAR, "data-mbg-viewer": key });
  const buttons = element("div", { class: "mbg-image-buttons" });
  bar.append(buttons);

  if (urls.length === 2) {
    const toggle = element("button", {
      type: "button",
      class: "mbg-image-button",
      "aria-expanded": String(state.open),
      text: "Pixel diff",
    });
    const panel = buildPanel(state, urls);
    toggle.addEventListener("click", () => {
      state.open = !state.open;
      toggle.setAttribute("aria-expanded", String(state.open));
      panel.hidden = !state.open;
      if (state.open) showPixelDiff(panel, state, urls);
      else state.result = null; // Free the pixels.
    });
    buttons.append(toggle);
    bar.append(panel);
    if (state.open) showPixelDiff(panel, state, urls);
  }

  const reload = element("button", {
    type: "button",
    class: "mbg-image-button",
    title: "Load this image diff again, without a reload of the page",
    text: "↻ Reload images",
  });
  reload.addEventListener("click", () => {
    reloadViewer(viewerOf(bar));
    if (state.open) {
      state.result = null;
      showPixelDiff(bar.querySelector(".mbg-pixel-diff"), state, urls);
    }
  });
  buttons.append(reload);
  return bar;
}

// A frame loads again when it is put back in the document. The element stays
// the same, so GitHub keeps its reference to it, and the new frame reports
// its size to GitHub as the first one did.
function reloadViewer(iframe) {
  if (!iframe) return;
  const parent = iframe.parentNode;
  const next = iframe.nextSibling;
  iframe.remove();
  parent.insertBefore(iframe, next);
}

function buildPanel(state, urls) {
  const panel = element("div", { class: "mbg-pixel-diff" });
  panel.hidden = !state.open;
  const modes = element("div", { class: "mbg-pixel-diff-modes", role: "group", "aria-label": "Pixel diff view" });
  for (const [mode, label] of MODES) {
    const button = element("button", {
      type: "button",
      class: "mbg-image-button",
      "data-mode": mode,
      "aria-pressed": String(state.mode === mode),
      text: label,
    });
    button.addEventListener("click", () => {
      state.mode = mode;
      for (const other of modes.children) other.setAttribute("aria-pressed", String(other === button));
      showPixelDiff(panel, state, urls);
    });
    modes.append(button);
  }
  const status = element("span", { class: "mbg-pixel-diff-status", role: "status" });
  const canvas = element("canvas", { class: "mbg-pixel-diff-canvas", width: "0", height: "0" });
  panel.append(
    element("div", { class: "mbg-pixel-diff-header" }, [modes, status]),
    element("div", { class: "mbg-pixel-diff-stage" }, [canvas])
  );
  return panel;
}

async function showPixelDiff(panel, state, urls) {
  const status = panel.querySelector(".mbg-pixel-diff-status");
  const canvas = panel.querySelector("canvas");
  if (!state.result) {
    state.result = compareImages(urls);
    // A failed load is not kept, so the next try loads the images again.
    state.result.catch(() => {
      state.result = null;
    });
  }
  const result = state.result;
  if (!panel.dataset.mbgReady) status.textContent = "Comparing the images…";

  let diff;
  try {
    diff = await result;
  } catch {
    status.textContent = "Could not load the images. Click Reload images to try again.";
    panel.dataset.mbgReady = "error";
    canvas.width = canvas.height = 0;
    return;
  }
  // Another click may have started a newer comparison, or closed the panel.
  if (result !== state.result || !state.open) return;

  status.textContent = describeDiff(diff);
  drawPixelDiff(canvas, diff, state.mode);
  panel.dataset.mbgReady = "true";
}

function loadPixels(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // The image hosts allow CORS, so a canvas can read the pixels.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(img, 0, 0);
      try {
        resolve(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

// Compares the images from their top-left corners. Where only one image has
// a pixel, because the sizes differ, the pixel counts as changed.
async function compareImages([baseUrl, headUrl]) {
  const [before, after] = await Promise.all([loadPixels(baseUrl), loadPixels(headUrl)]);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const changed = new Uint8Array(width * height);
  let count = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixelIndex(before, x, y);
      const b = pixelIndex(after, x, y);
      let differs = a < 0 || b < 0;
      if (!differs) {
        for (let c = 0; c < 4; c++) {
          if (before.data[a + c] !== after.data[b + c]) {
            differs = true;
            break;
          }
        }
      }
      if (!differs) continue;
      changed[y * width + x] = 1;
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  const box = count ? { left, top, right, bottom } : null;
  return { before, after, width, height, changed, count, box };
}

// The index of the pixel's first byte, or -1 if the image has no such pixel.
function pixelIndex(image, x, y) {
  return x < image.width && y < image.height ? (y * image.width + x) * 4 : -1;
}

function describeDiff({ before, after, width, height, count }) {
  const sizes =
    before.width === after.width && before.height === after.height
      ? ""
      : ` The size changes from ${before.width} × ${before.height} to ${after.width} × ${after.height}.`;
  if (count === 0) return "No pixels differ.";
  const total = width * height;
  const percent = (count / total) * 100;
  const shown = percent < 0.01 ? "less than 0.01" : String(Number(percent.toFixed(2)));
  const noun = count === 1 ? "pixel differs" : "pixels differ";
  return `${count.toLocaleString()} of ${total.toLocaleString()} ${noun} (${shown}%).${sizes}`;
}

function drawPixelDiff(canvas, diff, mode) {
  const { before, after, width, height } = diff;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);

  if (mode === "before" || mode === "after") {
    context.putImageData(mode === "before" ? before : after, 0, 0);
    return;
  }

  const out = context.createImageData(width, height);
  if (mode === "difference") paintDifference(out.data, diff);
  else paintHighlight(out.data, diff);
  context.putImageData(out, 0, 0);
  if (mode === "highlight" && diff.box) strokeBox(context, diff);
}

// Each changed pixel in the highlight color, on a faded gray copy of the
// head image.
function paintHighlight(data, { before, after, width, height, changed }) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (changed[y * width + x]) {
        data.set(HIGHLIGHT, i);
      } else {
        const source = pixelIndex(after, x, y) >= 0 ? after : before;
        const gray = grayOverWhite(source.data, pixelIndex(source, x, y));
        const faded = 255 - (255 - gray) * FADE;
        data[i] = data[i + 1] = data[i + 2] = faded;
      }
      data[i + 3] = 255;
    }
  }
}

// The absolute difference of each color channel: black where the images
// match. Where only one image has a pixel, it shows that pixel.
function paintDifference(data, { before, after, width, height }) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = pixelIndex(before, x, y);
      const b = pixelIndex(after, x, y);
      for (let c = 0; c < 3; c++) {
        const va = a < 0 ? 0 : overWhite(before.data, a, c);
        const vb = b < 0 ? 0 : overWhite(after.data, b, c);
        data[i + c] = Math.abs(va - vb);
      }
      data[i + 3] = 255;
    }
  }
}

// A channel's value with the pixel drawn on white, so transparent pixels
// show as white.
function overWhite(pixels, index, channel) {
  const alpha = pixels[index + 3] / 255;
  return pixels[index + channel] * alpha + 255 * (1 - alpha);
}

function grayOverWhite(pixels, index) {
  return 0.299 * overWhite(pixels, index, 0) + 0.587 * overWhite(pixels, index, 1) + 0.114 * overWhite(pixels, index, 2);
}

// A box around the changed pixels, so a small change is easy to find in a
// large image. The line scales with the image, since it is shown scaled down.
function strokeBox(context, { box, width, height }) {
  const line = Math.max(2, Math.round(Math.max(width, height) / 300));
  const gap = line * 2;
  context.strokeStyle = `rgb(${HIGHLIGHT.join(", ")})`;
  context.lineWidth = line;
  context.strokeRect(
    box.left - gap - line / 2,
    box.top - gap - line / 2,
    box.right - box.left + 1 + 2 * gap + line,
    box.bottom - box.top + 1 + 2 * gap + line
  );
}
