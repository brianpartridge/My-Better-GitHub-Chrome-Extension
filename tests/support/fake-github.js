// The server side of the fake github.com. It answers every github.com request
// for the page, so the real extension runs on the fake pages.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PAGE_SCRIPT = fs.readFileSync(path.join(__dirname, "fake-github-page.js"), "utf8");

const STYLE = `
  body { margin: 0; font: 14px sans-serif; }
  header { position: sticky; top: 0; height: 60px; background: #eee; z-index: 10; }
  #tabs a { margin-right: 12px; }
  #tree { position: fixed; top: 60px; left: 0; width: 280px; margin: 0; padding: 0; list-style: none; }
  #tree ul { list-style: none; padding-left: 12px; }
  #diffs { margin-left: 300px; }
  .fake-body { height: 1200px; background: #fafafa; }
`;

function digest(filePath) {
  return crypto.createHash("sha256").update(filePath).digest("hex");
}

// GitHub derives a diff's id from the file's path.
function diffId(filePath) {
  return `diff-${digest(filePath)}`;
}

// A file is a path, or { path, viewed, state }. The state is "ready",
// "loading", or "absent", which means that the diff is not in the DOM.
function normalize(file) {
  const { path: filePath, viewed = false, state = "ready" } = typeof file === "string" ? { path: file } : file;
  return { path: filePath, viewed, state, id: diffId(filePath) };
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
  }

  async install() {
    await this.page.route("**/*", (route) => {
      const url = new URL(route.request().url());
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

  // Opens a page, and waits for the extension to start.
  async open(url, options = {}) {
    this.options = { ...this.options, ...options };
    this.requests = 0;
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
