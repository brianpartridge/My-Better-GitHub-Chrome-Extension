// Reads the facts about GitHub's Files changed page that the extension and
// tests/support/fake-github-page.js depend on. It runs in the page, so it must
// not use anything from outside this function.

async function readContract() {
  const sha256 = async (text) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const REGION = '[role="region"][id^="diff-"]';
  const VIEWED = 'button[aria-pressed][aria-label="Viewed"], button[aria-pressed][aria-label="Not Viewed"]';
  const tree = document.querySelector('[role="tree"][aria-label="File Tree"]');
  const rows = tree ? [...tree.querySelectorAll('li[role="treeitem"]')] : [];
  const fileRows = rows.filter((row) => !row.hasAttribute("aria-expanded"));
  const directoryRows = rows.filter((row) => row.hasAttribute("aria-expanded"));

  const fileRowProblems = [];
  for (const row of fileRows) {
    const href = row.querySelector('a[href^="#diff-"]')?.getAttribute("href");
    if (!href) fileRowProblems.push(`${row.id}: no link to a diff`);
    else if (href !== `#diff-${await sha256(row.id)}`)
      fileRowProblems.push(`${row.id}: the link is not the path's digest`);
    if (!row.querySelector(":scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-content")) {
      fileRowProblems.push(`${row.id}: no TreeView container or content`);
    }
  }

  const regions = [...document.querySelectorAll(REGION)].filter((el) => !el.parentElement.closest(REGION));
  const loaded = regions.filter((el) => el.querySelector(VIEWED));
  const regionProblems = [];
  for (const region of loaded) {
    const heading = document.getElementById(region.getAttribute("aria-labelledby"));
    const path = heading?.textContent.replace(/[‎‏]/g, "").trim();
    if (!path) regionProblems.push(`${region.id}: no heading`);
    else if (region.id !== `diff-${await sha256(path)}`)
      regionProblems.push(`${region.id}: the id is not the digest of ${path}`);
  }

  const button = loaded[0]?.querySelector(VIEWED);
  const script = document.querySelector('script[data-target="react-app.embeddedData"]');
  const pr = location.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+/)?.[0];

  return {
    path: location.pathname,
    fileRows: fileRows.length,
    directoryRows: directoryRows.length,
    directoryRowContainsChildren: directoryRows.some((row) => row.querySelector('li[role="treeitem"]')),
    fileRowProblems,
    regions: regions.length,
    loadedRegions: loaded.length,
    regionProblems,
    viewedButtonLabel: button?.getAttribute("aria-label") ?? null,
    viewedButtonPressed: button?.getAttribute("aria-pressed") ?? null,
    hasEmbeddedDiffSummaries: Boolean(script?.textContent.includes('"diffSummaries"')),
    tabLinks: ["", "/commits", "/checks", "/changes"].filter((suffix) =>
      document.querySelector(`a[class*="TabNavLink"][href="${pr + suffix}"]`)
    ).length,
  };
}

module.exports = { readContract };
