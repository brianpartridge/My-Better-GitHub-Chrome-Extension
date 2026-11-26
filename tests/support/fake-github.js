// The server side of the fake github.com. It answers every github.com request
// for the page, so the real extension runs on the fake pages.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { encodePng } = require("./png");

const PAGE_SCRIPT = fs.readFileSync(path.join(__dirname, "fake-github-page.js"), "utf8");

const STYLE = `
  body { margin: 0; font: 14px sans-serif; }
  header { position: sticky; top: 0; height: 60px; background: #eee; z-index: 10; }
  #tabs a { margin-right: 12px; }
  #tree { position: fixed; top: 60px; left: 0; width: 280px; margin: 0; padding: 0; list-style: none; }
  #tree ul { list-style: none; padding-left: 12px; }
  #diffs { margin-left: 300px; }
  .fake-body { height: 1200px; background: #fafafa; }
  .fake-body.fake-image { height: auto; }
  .fake-image iframe { width: 100%; height: 120px; border: 0; }
`;

function digest(filePath) {
  return crypto.createHash("sha256").update(filePath).digest("hex");
}

// GitHub derives a diff's id from the file's path.
function diffId(filePath) {
  return `diff-${digest(filePath)}`;
}

// An image's URL on GitHub's raw image host, at the base or head commit.
function imageUrl(commit, filePath) {
  return `https://raw.githubusercontent.com/o/r/${commit}/${filePath}`;
}

function toHex(text) {
  return Buffer.from(text, "utf8").toString("hex");
}

// The URL of GitHub's image viewer for the file, as on the real page. A
// changed image has enc_url1 and enc_url2. An added image has only enc_url.
function viewerUrl(file) {
  const params = new URLSearchParams({ commit: "head", path: file.path });
  if (file.image.before) {
    params.set("enc_url1", toHex(imageUrl("base", file.path)));
    params.set("enc_url2", toHex(imageUrl("head", file.path)));
  } else {
    params.set("enc_url", toHex(imageUrl("head", file.path)));
  }
  return `https://viewscreen.githubusercontent.com/diff/img?${params}#frame-${digest(file.path).slice(0, 8)}`;
}

// A file is a path, or { path, viewed, state, image }. The state is "ready",
// "loading", or "absent", which means that the diff is not in the DOM. An
// image is { before, after }. Each is an image from png.js, or "missing" for
// an image that doesn't load. An added image has no before.
function normalize(file) {
  const { path: filePath, viewed = false, state = "ready", image } = typeof file === "string" ? { path: file } : file;
  const normal = { path: filePath, viewed, state, id: diffId(filePath) };
  if (image) normal.viewer = viewerUrl({ path: filePath, image });
  return normal;
}

// The image bytes by URL. A missing image has null.
function imagesOf(files) {
  const images = new Map();
  for (const file of files) {
    if (typeof file === "string" || !file.image) continue;
    for (const [commit, image] of [["base", file.image.before], ["head", file.image.after]]) {
      if (image) images.set(imageUrl(commit, file.path), image === "missing" ? null : encodePng(image));
    }
  }
  return images;
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function embeddedData(files) {
  const diffSummaries = files.map((file) => ({
    path: file.path,
    pathDigest: file.id.slice("diff-".length),
    markedAsViewed: file.viewed,
  }));
  return `<script type="application/json" data-target="react-app.embeddedData">${escapeJson({
    payload: { pullRequest: { diffSummaries } },
  })}</script>`;
}

function renderPage({ files, tabStyle, withEmbeddedData }) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>fake github</title><style>${STYLE}</style></head>
  <body>
    <header><nav id="tabs"></nav><textarea id="comment" rows="1"></textarea></header>
    <ul id="tree" role="tree" aria-label="File Tree"></ul>
    <div id="diffs"></div>
    ${withEmbeddedData ? embeddedData(files) : ""}
    <script type="application/json" id="fake-config">${escapeJson({ files, tabStyle })}</script>
    <script>${PAGE_SCRIPT}</script>
  </body>
</html>`;
}

class FakeGitHub {
  constructor(page) {
    this.page = page;
    this.options = { files: [], tabStyle: "react", embeddedData: "always" };
    this.requests = 0;
    this.images = new Map();
    this.viewerLoads = new Map();
  }

  async install() {
    await this.page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "raw.githubusercontent.com") return this.fulfillImage(route);
      if (url.hostname === "viewscreen.githubusercontent.com") return this.fulfillViewer(route);
      if (url.hostname !== "github.com") return route.abort();
      this.requests++;
      const withEmbeddedData =
        this.options.embeddedData === "always" || (this.options.embeddedData === "fetch-only" && this.requests > 1);
      return route.fulfill({
        contentType: "text/html",
        body: renderPage({ ...this.options, files: this.options.files.map(normalize), withEmbeddedData }),
      });
    });
  }

  // GitHub's image hosts allow CORS, so a canvas can read the pixels.
  fulfillImage(route) {
    const bytes = this.images.get(route.request().url());
    if (!bytes) return route.fulfill({ status: 404, body: "Not Found" });
    return route.fulfill({
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: bytes,
    });
  }

  // The real viewer shows the images. This one counts its loads.
  fulfillViewer(route) {
    const key = route.request().url().split("#")[0];
    this.viewerLoads.set(key, (this.viewerLoads.get(key) || 0) + 1);
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Image viewer</p>" });
  }

  // Changes an image on the image host. The side is "before" or "after".
  setImage(filePath, side, image) {
    const url = imageUrl(side === "before" ? "base" : "head", filePath);
    this.images.set(url, image === "missing" ? null : encodePng(image));
  }

  // How many times the image viewer of the file has loaded.
  viewerLoadCount(filePath) {
    const file = this.options.files.map(normalize).find((f) => f.path === filePath);
    return this.viewerLoads.get(file.viewer.split("#")[0]) || 0;
  }

  // Opens a page, and waits for the extension to start.
  async open(url, options = {}) {
    this.options = { ...this.options, ...options };
    this.requests = 0;
    this.images = imagesOf(this.options.files);
    this.viewerLoads = new Map();
    await this.page.goto(`https://github.com${url}`);
    if (/\/pull\/\d+/.test(url) && this.options.tabStyle !== "none") {
      await this.page.locator("a[data-mbg-key]").first().waitFor({ state: "attached" });
    }
  }

  // Opens the Files changed page of PR 1.
  openChanges(files, options = {}) {
    return this.open("/o/r/pull/1/changes", { ...options, files });
  }

  viewedPaths() {
    return this.page.evaluate(() => window.fakeGitHub.viewedPaths());
  }

  mount(filePath) {
    return this.page.evaluate((p) => window.fakeGitHub.mount(p), filePath);
  }

  unmount(filePath) {
    return this.page.evaluate((p) => window.fakeGitHub.unmount(p), filePath);
  }

  finishLoading(filePath) {
    return this.page.evaluate((p) => window.fakeGitHub.finishLoading(p), filePath);
  }

  softNavigations() {
    return this.page.evaluate(() => window.fakeGitHub.softNavigations());
  }
}

module.exports = { FakeGitHub, diffId, digest };
