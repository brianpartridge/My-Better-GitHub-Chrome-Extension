// Keyboard navigation between files on a PR's Files changed page:
//   j  select the next file
//   k  select the previous file
//   v  toggle the selected file's "Viewed" checkbox. When this marks the
//      file viewed, select the next file and keep the viewed file at the top
//      of the screen.
//
// The selected diff and its file tree row are only tagged with data
// attributes; all visuals live in file-nav.css. Clicking inside a diff also
// selects it, so j/k continue from wherever you are reading.
//
// GitHub renders diffs lazily. A diff below the screen may not be in the DOM
// yet, and GitHub replaces a diff's element when it renders it. So the
// selection is remembered by the diff's id rather than its element, and a
// next file that is not rendered yet is selected as soon as it appears.
//
// To log what each key press does, run localStorage.mbgDebug = "1" in the
// DevTools console on github.com, then reload the page.

const FILE_NAV_PAGE = /^\/[^/]+\/[^/]+\/pull\/\d+\/(changes|files)(\/|$)/;
const PR_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+/;
const DIFF_REGION = '[role="region"][id^="diff-"]';

// The selected diff's id, and the PR it belongs to. GitHub derives a diff's
// id from the file's path, so another PR that changes the same file has a
// diff with the same id.
let selectedId = null;
let selectedPr = null;

let debugOn = false;
try {
  debugOn = localStorage.getItem("mbgDebug") === "1";
} catch {
  // Storage can be blocked; logging stays off.
}

function debug(...args) {
  if (debugOn) console.debug("[mbg]", ...args);
}

function describe(region) {
  return region ? `${region.id.slice(5, 13)} ${pathOf(region) || "(loading)"}` : null;
}

// Capture phase, so GitHub's own handlers don't see keys we act on.
document.addEventListener(
  "keydown",
  (event) => {
    if (!["j", "k", "v"].includes(event.key)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (isFileNavTypingContext(event.target)) return;
    if (!FILE_NAV_PAGE.test(location.pathname)) return;

    forgetOtherPr();
    const regions = allRegions();
    if (regions.length === 0) return;
    cancelWait();
    debug(event.key, "selected:", describe(selectedRegion()), "rendered:", regions.length);

    if (event.key === "v") {
      const region = currentRegion(regions);
      const button = region?.querySelector(
        'button[aria-pressed][aria-label="Viewed"], button[aria-pressed][aria-label="Not Viewed"]'
      );
      if (!button) return;
      consume(event);
      const markingViewed = button.getAttribute("aria-pressed") !== "true";
      button.click();
      if (!markingViewed) {
        select(region);
        return;
      }
      // Select the next file, and pin the collapsed file to the top of the
      // screen so the next file shows right below it. If GitHub has not
      // rendered the next file yet, it does so once the viewed file
      // collapses, and the next file is selected when it appears.
      const next = regionAfter(region, regions);
      debug("marked", describe(region), "next:", describe(next));
      if (next) {
        select(next);
      } else {
        // Keep the viewed file selected until the next one appears, so a
        // first press of v still selects a file.
        select(region);
        waitForRegionAfter(region, select);
      }
      scrollToRegion(region.id);
      return;
    }

    consume(event);
    const current = currentRegion(regions);
    if (!selectedRegion()) {
      // First press: start from the file you are looking at.
      select(current);
      scrollToRegion(current.id);
      return;
    }
    if (event.key === "k") {
      const previous = regions[Math.max(regions.indexOf(current) - 1, 0)];
      debug("previous:", describe(previous));
      select(previous);
      scrollToRegion(previous.id);
      return;
    }
    const next = regionAfter(current, regions);
    debug("next:", describe(next));
    if (next) {
      select(next);
      scrollToRegion(next.id);
      return;
    }
    // Either this is the last file, or GitHub has not rendered the next one
    // yet. Show the space below this file so GitHub renders what is there,
    // and select the next file when it appears. A pin from the previous
    // key press must not pull the screen back up.
    pinId++;
    window.scrollBy({
      top: current.getBoundingClientRect().bottom - stickyHeaderBottom(),
      behavior: "instant",
    });
    waitForRegionAfter(current, (region) => {
      select(region);
      scrollToRegion(region.id);
    });
  },
  true
);

document.addEventListener("mousedown", (event) => {
  if (!FILE_NAV_PAGE.test(location.pathname)) return;
  const region = event.target instanceof Element && event.target.closest(DIFF_REGION);
  if (region) select(fileRegionOf(region));
});

function consume(event) {
  event.preventDefault();
  event.stopPropagation();
}

// Every rendered diff, in page order. While a diff loads, GitHub nests a
// second region with the same id inside the file's region, so only
// outermost regions count.
function allRegions() {
  return [...document.querySelectorAll(DIFF_REGION)].filter(isFileRegion);
}

function isFileRegion(el) {
  return el.matches(DIFF_REGION) && !el.parentElement?.closest(DIFF_REGION);
}

// The file's own region, for a region nested inside it.
function fileRegionOf(region) {
  return region.parentElement?.closest(DIFF_REGION) ? fileRegionOf(region.parentElement.closest(DIFF_REGION)) : region;
}

function regionById(id) {
  const el = id ? document.getElementById(id) : null;
  return el && isFileRegion(el) ? el : null;
}

function selectedRegion() {
  return regionById(selectedId);
}

function prPath() {
  return location.pathname.match(PR_PATH)?.[0] ?? null;
}

// After a soft navigation to another PR, the selection and any wait belong
// to the old PR, so drop them.
function forgetOtherPr() {
  if (selectedId && selectedPr !== prPath()) {
    debug("left the selection's PR");
    selectedId = null;
  }
  if (waiting && selectedPr !== prPath()) cancelWait();
}

// The rendered diff after the given one, or null.
function regionAfter(region, regions = allRegions()) {
  const index = regions.indexOf(region);
  return index < 0 ? null : regions[index + 1] || null;
}

// The selected file, or else the first file visible below the sticky header.
function currentRegion(regions) {
  const selected = selectedRegion();
  if (selected) return selected;
  const top = stickyHeaderBottom();
  return regions.find((r) => r.getBoundingClientRect().bottom > top + 1) || regions[regions.length - 1];
}

// Reselecting the selected file does nothing, so the file tree keeps any
// scrolling the user did.
function select(region) {
  if (region.id === selectedId && selectedPr === prPath()) return;
  selectedId = region.id;
  selectedPr = prPath();
  tagSelected(region);
  markTreeRow(region)?.scrollIntoView({ block: "nearest" });
}

// Tags the given diff as selected, and no other diff.
function tagSelected(region) {
  for (const other of document.querySelectorAll(`${DIFF_REGION}[data-mbg-selected]`)) {
    if (other !== region) other.removeAttribute("data-mbg-selected");
  }
  if (region && !region.hasAttribute("data-mbg-selected")) region.setAttribute("data-mbg-selected", "");
}

// Tags the given diff's tree row, and returns it.
function markTreeRow(region) {
  const row = region ? treeRowFor(region) : null;
  for (const other of document.querySelectorAll('li[role="treeitem"][data-mbg-selected]')) {
    if (other !== row) other.removeAttribute("data-mbg-selected");
  }
  if (row && !row.hasAttribute("data-mbg-selected")) row.setAttribute("data-mbg-selected", "");
  return row;
}

function treeRowFor(region) {
  const path = pathOf(region);
  if (!path) return null;
  const tree = document.querySelector('[role="tree"][aria-label="File Tree"]');
  return (tree && [...tree.querySelectorAll('li[role="treeitem"]')].find((li) => li.id === path)) || null;
}

// The file's path from the diff's heading, or null while the diff loads.
// GitHub wraps the file name in LTR marks.
function pathOf(region) {
  const heading = document.getElementById(region.getAttribute("aria-labelledby"));
  return heading?.textContent.replace(/[‎‏]/g, "").trim() || null;
}

// GitHub mounts tree rows lazily, such as when a directory expands, and can
// replace them. It can also replace a diff's element when it renders the
// diff. Tag the selected diff and its row again after DOM changes, without
// scrolling, and select a file that is being waited for once it appears.
let syncScheduled = false;
let lastSynced = null;
new MutationObserver(() => {
  if (syncScheduled || (!selectedId && !waiting)) return;
  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    forgetOtherPr();
    const region = selectedRegion();
    if (region !== lastSynced) {
      debug("selected element", region ? "changed:" : "gone:", describe(region) || selectedId);
      lastSynced = region;
    }
    tagSelected(region);
    markTreeRow(region);
    checkWait();
  });
}).observe(document.documentElement, { subtree: true, childList: true });

// A file GitHub has not rendered yet can't be selected until it appears, so
// remember which diff it follows and select it when it shows up. Any scroll
// or other key press from the user ends the wait.
const WAIT_MS = 10000;
let waiting = null;

function waitForRegionAfter(region, onFound) {
  debug("waiting for the file after", describe(region));
  waiting = { afterId: region.id, onFound, until: performance.now() + WAIT_MS };
}

function cancelWait() {
  waiting = null;
}

function checkWait() {
  if (!waiting) return;
  const after = regionById(waiting.afterId);
  if (!after || performance.now() > waiting.until) {
    debug("wait ended:", after ? "timeout" : "file gone");
    waiting = null;
    return;
  }
  const next = regionAfter(after);
  if (!next) return;
  debug("waited file appeared:", describe(next));
  const { onFound } = waiting;
  waiting = null;
  onFound(next);
}

// Diffs render lazily (content-visibility: auto), and GitHub collapses a
// diff some time after it is marked viewed. Both move the layout after we
// scroll, so keep the file pinned below the sticky header for a short time.
// Any scroll input from the user stops this.
const PIN_MS = 600;
let pinId = 0;

function scrollToRegion(id) {
  const pin = ++pinId;
  const end = performance.now() + PIN_MS;
  regionById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
  const align = () => {
    if (pin !== pinId) return;
    // Look the diff up again each frame, in case GitHub replaced its element.
    const region = regionById(id);
    if (!region) return;
    // Pull the file back out from under GitHub's sticky page header.
    const offset = region.getBoundingClientRect().top - stickyHeaderBottom();
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: "instant" });
    if (performance.now() < end) requestAnimationFrame(align);
  };
  align();
}

for (const type of ["wheel", "touchstart", "mousedown"]) {
  window.addEventListener(
    type,
    () => {
      pinId++;
      cancelWait();
    },
    { passive: true, capture: true }
  );
}
window.addEventListener(
  "keydown",
  (event) => {
    if (!["j", "k", "v"].includes(event.key)) {
      pinId++;
      cancelWait();
    }
  },
  true
);

// Bottom edge of any sticky or fixed page chrome at the top of the viewport.
// Each diff's own sticky file header is ignored.
function stickyHeaderBottom() {
  let bottom = 0;
  const seen = new Set();
  for (const el of document.elementsFromPoint(window.innerWidth / 2, 1)) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (seen.has(node)) break;
      seen.add(node);
      if (node.closest(DIFF_REGION)) continue;
      const position = getComputedStyle(node).position;
      if (position === "sticky" || position === "fixed") {
        bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
      }
    }
  }
  return bottom;
}

function isFileNavTypingContext(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]"));
}
