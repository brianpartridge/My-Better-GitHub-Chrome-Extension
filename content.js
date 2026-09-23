// Maps keys 1-4 to the PR tabs: Conversation, Commits, Checks, Files changed.
//
// Matched on all of github.com (not just /pull/ URLs) because GitHub navigates
// with Turbo (soft navigation) — a content script scoped to PR URLs would never
// inject if you arrived at a PR without a full page load. Instead, the URL is
// checked on every keypress.

const TAB_SUFFIXES = {
  "1": "",         // Conversation
  "2": "/commits",
  "3": "/checks",
  "4": "/changes", // GitHub's current URL; the old "/files" still redirects here
};

// Other URLs for the same tab, so we don't reload a tab you're already on.
const TAB_ALIASES = {
  "/changes": ["/files"],
};

document.addEventListener("keydown", (event) => {
  const suffix = TAB_SUFFIXES[event.key];
  if (suffix === undefined) return;

  // Don't hijack typing or browser/GitHub shortcuts that use modifiers.
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (isTypingContext(event.target)) return;

  const prMatch = location.pathname.match(/^(\/[^/]+\/[^/]+\/pull\/\d+)/);
  if (!prMatch) return;

  const path = prMatch[1] + suffix;
  const aliases = (TAB_ALIASES[suffix] || []).map((alias) => prMatch[1] + alias);
  // Sub-paths (e.g. /changes/<sha>) count as the same tab, except for
  // Conversation, whose path is a prefix of every other tab.
  const onTab = (p) => location.pathname === p || (suffix !== "" && location.pathname.startsWith(p + "/"));
  if ([path, ...aliases].some(onTab)) return;

  event.preventDefault();

  // Prefer clicking the real tab link so GitHub's Turbo navigation (fast,
  // no full reload) handles it; fall back to a hard navigation.
  // The tab bar's class names differ between GitHub's classic and React UIs.
  const link =
    document.querySelector(`nav.tabnav-tabs a[href="${path}"], a.tabnav-tab[href="${path}"]`) ||
    document.querySelector(`a[class*="TabNavLink"][href="${path}"]`);
  if (link) {
    link.click();
  } else {
    location.assign(path);
  }
});

function isTypingContext(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable]")) return true;
  return false;
}
