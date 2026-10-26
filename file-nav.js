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

const FILE_NAV_PAGE = /^\/[^/]+\/[^/]+\/pull\/\d+\/(changes|files)(\/|$)/;
const DIFF_REGION = '[role="region"][id^="diff-"]';

let selectedRegion = null;

// Capture phase, so GitHub's own handlers don't see keys we act on.
document.addEventListener(
  "keydown",
  (event) => {
    if (!["j", "k", "v"].includes(event.key)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (isFileNavTypingContext(event.target)) return;
    if (!FILE_NAV_PAGE.test(location.pathname)) return;

    const regions = [...document.querySelectorAll(DIFF_REGION)];
    if (regions.length === 0) return;

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
      // screen so the next file shows right below it.
      const index = regions.indexOf(region);
      select(regions[Math.min(index + 1, regions.length - 1)]);
      scrollToRegion(region);
      return;
    }

    consume(event);
    const index = regions.indexOf(currentRegion(regions));
    let next;
    if (!selectedRegion?.isConnected) {
      // First press: start from the file you are looking at.
      next = regions[index];
    } else if (event.key === "j") {
      next = regions[Math.min(index + 1, regions.length - 1)];
    } else {
      next = regions[Math.max(index - 1, 0)];
    }
    select(next);
    scrollToRegion(next);
  },
  true
);

document.addEventListener("mousedown", (event) => {
  if (!FILE_NAV_PAGE.test(location.pathname)) return;
  const region = event.target instanceof Element && event.target.closest(DIFF_REGION);
  if (region) select(region);
});

function consume(event) {
  event.preventDefault();
  event.stopPropagation();
}

// The selected file, or else the first file visible below the sticky header.
function currentRegion(regions) {
  if (selectedRegion?.isConnected) return selectedRegion;
  const top = stickyHeaderBottom();
  return regions.find((r) => r.getBoundingClientRect().bottom > top + 1) || regions[regions.length - 1];
}

// Reselecting the selected file does nothing, so the file tree keeps any
// scrolling the user did.
function select(region) {
  if (region === selectedRegion) return;
  selectedRegion?.removeAttribute("data-mbg-selected");
  selectedRegion = region;
  region.setAttribute("data-mbg-selected", "");
  markTreeRow()?.scrollIntoView({ block: "nearest" });
}

// Tags the selected file's tree row, and returns it.
function markTreeRow() {
  const row = selectedRegion?.isConnected ? treeRowFor(selectedRegion) : null;
  for (const other of document.querySelectorAll('li[role="treeitem"][data-mbg-selected]')) {
    if (other !== row) other.removeAttribute("data-mbg-selected");
  }
  if (row && !row.hasAttribute("data-mbg-selected")) row.setAttribute("data-mbg-selected", "");
  return row;
}

function treeRowFor(region) {
  // GitHub wraps the file name in LTR marks.
  const heading = document.getElementById(region.getAttribute("aria-labelledby"));
  const path = heading?.textContent.replace(/[‎‏]/g, "").trim();
  if (!path) return null;
  const tree = document.querySelector('[role="tree"][aria-label="File Tree"]');
  return (tree && [...tree.querySelectorAll('li[role="treeitem"]')].find((li) => li.id === path)) || null;
}

// GitHub mounts tree rows lazily, such as when a directory expands, and can
// replace them. Tag the selected file's row again after DOM changes, without
// scrolling the tree.
let markScheduled = false;
new MutationObserver(() => {
  if (markScheduled || !selectedRegion) return;
  markScheduled = true;
  requestAnimationFrame(() => {
    markScheduled = false;
    markTreeRow();
  });
}).observe(document.documentElement, { subtree: true, childList: true });

// Diffs render lazily (content-visibility: auto), and GitHub collapses a
// diff some time after it is marked viewed. Both move the layout after we
// scroll, so keep the file pinned below the sticky header for a short time.
// Any scroll input from the user stops this.
const PIN_MS = 600;
let pinId = 0;

function scrollToRegion(region) {
  const id = ++pinId;
  const end = performance.now() + PIN_MS;
  region.scrollIntoView({ block: "start", behavior: "instant" });
  const align = () => {
    if (id !== pinId || !region.isConnected) return;
    // Pull the file back out from under GitHub's sticky page header.
    const offset = region.getBoundingClientRect().top - stickyHeaderBottom();
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: "instant" });
    if (performance.now() < end) requestAnimationFrame(align);
  };
  align();
}

for (const type of ["wheel", "touchstart", "mousedown"]) {
  window.addEventListener(type, () => pinId++, { passive: true, capture: true });
}
window.addEventListener(
  "keydown",
  (event) => {
    if (!["j", "k", "v"].includes(event.key)) pinId++;
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
