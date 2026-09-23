// Mirrors each file's "Viewed" state into the file tree on a PR's Files
// changed page, so you can see at a glance how much is left to review.
//
// Viewed state comes from two sources:
//   1. The page's embedded React data (`diffSummaries[].markedAsViewed`), which
//      covers every file, including diffs GitHub has not rendered yet.
//   2. The live "Viewed" buttons in each diff header (`aria-pressed`), which
//      win over the embedded data because they reflect toggles made since load.
//
// Tree rows are only tagged with data attributes; all visuals live in
// viewed-tree.css. We never add nodes to GitHub's React-managed tree.

const FILES_PAGE = /^(\/[^/]+\/[^/]+\/pull\/\d+)\/(changes|files)(\/|$)/;

let prKey = null;
let viewedByPath = new Map();
let pathByDigest = new Map();
let seededFromScript = null;
let fetchStarted = false;
let scheduled = false;

new MutationObserver(schedule).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["aria-pressed"],
});
schedule();

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    update();
  });
}

function update() {
  const match = location.pathname.match(FILES_PAGE);
  if (!match) return;

  if (match[1] !== prKey) {
    prKey = match[1];
    viewedByPath = new Map();
    pathByDigest = new Map();
    seededFromScript = null;
    fetchStarted = false;
  }

  seedFromEmbeddedData(document);
  readViewedButtons();
  paintTree();
}

// Initial state for every file. After a soft navigation the embedded script
// may belong to a different page, so fall back to fetching this page's HTML.
function seedFromEmbeddedData(doc) {
  const script = doc.querySelector('script[data-target="react-app.embeddedData"]');
  if (doc === document && script === seededFromScript) return;
  if (doc === document) seededFromScript = script;

  const summaries = script && findDiffSummaries(safeParse(script.textContent));
  if (!summaries) {
    if (doc === document) fetchPageData();
    return;
  }

  for (const s of summaries) {
    if (!s || typeof s.path !== "string") continue;
    if (s.pathDigest) pathByDigest.set(s.pathDigest, s.path);
    // Don't overwrite state already read from a live button.
    if (!viewedByPath.has(s.path)) {
      viewedByPath.set(s.path, Boolean(s.markedAsViewed ?? s.reviewed));
    }
  }
}

async function fetchPageData() {
  if (fetchStarted) return;
  fetchStarted = true;
  const key = prKey;
  try {
    const res = await fetch(location.pathname, { credentials: "same-origin" });
    if (!res.ok || key !== prKey) return;
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    if (key !== prKey) return;
    seedFromEmbeddedData(doc);
    schedule();
  } catch {
    // Live buttons still work without the seed data.
  }
}

function findDiffSummaries(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (Array.isArray(node.diffSummaries)) return node.diffSummaries;
  for (const value of Object.values(node)) {
    const found = findDiffSummaries(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readViewedButtons() {
  const buttons = document.querySelectorAll(
    '[role="region"][id^="diff-"] button[aria-pressed][aria-label="Viewed"], ' +
    '[role="region"][id^="diff-"] button[aria-pressed][aria-label="Not Viewed"]'
  );
  for (const button of buttons) {
    const path = pathForRegion(button.closest('[role="region"][id^="diff-"]'));
    if (path) viewedByPath.set(path, button.getAttribute("aria-pressed") === "true");
  }
}

function pathForRegion(region) {
  const digest = region.id.slice("diff-".length);
  if (pathByDigest.has(digest)) return pathByDigest.get(digest);

  // Fallback: the header's file name. GitHub wraps it in LTR marks.
  const heading = document.getElementById(region.getAttribute("aria-labelledby"));
  const path = heading?.textContent.replace(/[‎‏]/g, "").trim();
  if (path) pathByDigest.set(digest, path);
  return path || null;
}

function paintTree() {
  const tree = document.querySelector('[role="tree"][aria-label="File Tree"]');
  if (!tree || viewedByPath.size === 0) return;

  for (const item of tree.querySelectorAll('li[role="treeitem"]')) {
    const path = item.id;
    const isDirectory = item.hasAttribute("aria-expanded");

    let viewed = 0;
    let total = 0;
    if (isDirectory) {
      const prefix = path + "/";
      for (const [filePath, isViewed] of viewedByPath) {
        if (!filePath.startsWith(prefix)) continue;
        total++;
        if (isViewed) viewed++;
      }
    } else if (viewedByPath.has(path)) {
      total = 1;
      viewed = viewedByPath.get(path) ? 1 : 0;
    }

    // CSS attr() reads from the element that owns ::after, so the count goes
    // on the row's content element rather than the <li>.
    const content = item.querySelector(
      ":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content"
    );

    if (total === 0) {
      setAttr(item, "data-prv-state", null);
      if (content) setAttr(content, "data-prv-count", null);
      continue;
    }

    const state = viewed === total ? "viewed" : viewed === 0 ? "unviewed" : "partial";
    setAttr(item, "data-prv-state", state);
    if (content) setAttr(content, "data-prv-count", isDirectory ? `${viewed}/${total}` : null);
  }
}

// Only write when the value changes, to keep DOM churn low.
function setAttr(el, name, value) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}
