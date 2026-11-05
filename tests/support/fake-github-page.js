// The page side of the fake github.com. It runs in the page and copies the
// parts of GitHub's Files changed page that the extension depends on:
//
// - The file tree: rows, directories, links to diffs, and keyboard use.
// - Diffs, including those that are still loading or are not in the DOM.
// - The Viewed button, which collapses the diff a moment after a click.
// - A sticky page header, and tab links that navigate without a page load.
//
// Tests control it through window.fakeGitHub. tests/live checks these facts
// against the real github.com.

(() => {
  const { files, tabStyle } = JSON.parse(document.getElementById("fake-config").textContent);
  const list = document.getElementById("diffs");
  const tree = document.getElementById("tree");
  const byPath = new Map(files.map((file) => [file.path, file]));
  let softNavigations = 0;

  function bodyElement() {
    const body = document.createElement("div");
    body.className = "fake-body";
    return body;
  }

  // A loaded diff. GitHub wraps the file name in LTR marks.
  function readyRegion(file) {
    const region = document.createElement("div");
    region.setAttribute("role", "region");
    region.id = file.id;
    region.setAttribute("aria-labelledby", `heading-${file.id}`);
    region.style.contentVisibility = "auto";

    const heading = document.createElement("h3");
    heading.id = `heading-${file.id}`;
    const link = document.createElement("a");
    link.href = `#${file.id}`;
    link.innerHTML = "<code></code>";
    link.firstChild.textContent = `‎${file.path}‎`;
    heading.append(link);

    const button = document.createElement("button");
    button.type = "button";
    setViewedButton(button, file.viewed);
    button.addEventListener("click", () => {
      file.viewed = !file.viewed;
      setViewedButton(button, file.viewed);
      // GitHub collapses the diff shortly after the click.
      setTimeout(() => {
        region.querySelector(".fake-body")?.remove();
        if (!file.viewed) region.append(bodyElement());
      }, 50);
    });

    region.append(heading, button);
    if (!file.viewed) region.append(bodyElement());
    return region;
  }

  function setViewedButton(button, viewed) {
    button.setAttribute("aria-pressed", String(viewed));
    button.setAttribute("aria-label", viewed ? "Viewed" : "Not Viewed");
    button.textContent = "Viewed";
  }

  // A diff that is loading: no button, no label, and a nested region with the
  // same id.
  function loadingRegion(file) {
    const region = document.createElement("div");
    region.setAttribute("role", "region");
    region.id = file.id;
    const nested = document.createElement("div");
    nested.setAttribute("role", "region");
    nested.id = file.id;
    nested.setAttribute("aria-label", `Loading ${file.path}`);
    nested.textContent = `Loading ${file.path}`;
    region.append(nested);
    return region;
  }

  // Adds the file's diff at its place in the file order.
  function insertEntry(file) {
    const entry = document.createElement("div");
    entry.className = "diffEntry";
    entry.dataset.path = file.path;
    entry.append(file.state === "loading" ? loadingRegion(file) : readyRegion(file));
    const after = files.slice(files.indexOf(file) + 1);
    const next = after.map((other) => list.querySelector(`[data-entry="${other.id}"]`)).find(Boolean);
    entry.dataset.entry = file.id;
    list.insertBefore(entry, next || null);
  }

  function entryOf(file) {
    return list.querySelector(`[data-entry="${file.id}"]`);
  }

  for (const file of files) {
    if (file.state !== "absent") insertEntry(file);
  }

  // Tree rows: the same classes as GitHub's TreeView. A directory row has
  // aria-expanded and contains its child rows.
  function rowElement(id, label, level) {
    const row = document.createElement("li");
    row.setAttribute("role", "treeitem");
    row.id = id;
    row.tabIndex = 0;
    row.className = "PRIVATE_TreeView-item";
    row.setAttribute("aria-level", String(level));
    const container = document.createElement("div");
    container.className = "PRIVATE_TreeView-item-container";
    const content = document.createElement("div");
    content.className = "PRIVATE_TreeView-item-content";
    const visual = document.createElement("div");
    visual.className = "PRIVATE_TreeView-item-visual";
    const text = document.createElement("span");
    text.className = "PRIVATE_TreeView-item-content-text";
    text.textContent = label;
    content.append(visual, text);
    container.append(content);
    row.append(container);
    return row;
  }

  const groups = new Map([["", tree]]);
  function groupFor(path, level) {
    if (groups.has(path)) return groups.get(path);
    const slash = path.lastIndexOf("/");
    const parent = groupFor(slash < 0 ? "" : path.slice(0, slash), level - 1);
    const row = rowElement(path, path.slice(slash + 1), level);
    row.setAttribute("aria-expanded", "true");
    const group = document.createElement("ul");
    group.setAttribute("role", "group");
    row.append(group);
    parent.append(row);
    groups.set(path, group);
    return group;
  }

  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop();
    const group = groupFor(parts.join("/"), parts.length);
    const row = rowElement(file.path, "", parts.length + 1);
    const link = document.createElement("a");
    link.href = `#${file.id}`;
    link.setAttribute("role", "presentation");
    link.tabIndex = -1;
    link.textContent = name;
    row.querySelector(".PRIVATE_TreeView-item-content-text").append(link);
    group.append(row);
  }

  function activate(row) {
    if (row.hasAttribute("aria-expanded")) {
      const expanded = row.getAttribute("aria-expanded") === "true";
      row.setAttribute("aria-expanded", String(!expanded));
      row.querySelector(":scope > ul").hidden = expanded;
    } else {
      location.hash = row.querySelector("a").getAttribute("href");
    }
  }

  tree.addEventListener("click", (event) => {
    const row = event.target.closest('li[role="treeitem"]');
    if (!row) return;
    event.preventDefault();
    activate(row);
  });
  tree.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate(event.target.closest('li[role="treeitem"]'));
  });

  // Tab links navigate without a page load, like GitHub's Turbo links.
  const pr = location.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+/)?.[0];
  const nav = document.getElementById("tabs");
  if (pr && tabStyle !== "none") {
    for (const suffix of ["", "/commits", "/checks", "/changes"]) {
      const link = document.createElement("a");
      link.href = pr + suffix;
      link.textContent = suffix.slice(1) || "conversation";
      link.className = tabStyle === "classic" ? "tabnav-tab" : "TabNavLink__fake";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        softNavigations++;
        history.pushState(null, "", link.href);
      });
      nav.append(link);
    }
  }

  window.fakeGitHub = {
    // GitHub replaces the region element when the diff loads.
    finishLoading(path) {
      const file = byPath.get(path);
      file.state = "ready";
      entryOf(file).firstChild.replaceWith(readyRegion(file));
    },
    // GitHub's virtualized list adds and removes diffs as you scroll.
    mount(path) {
      const file = byPath.get(path);
      file.state = "ready";
      insertEntry(file);
    },
    unmount(path) {
      const file = byPath.get(path);
      file.state = "absent";
      entryOf(file).remove();
    },
    viewedPaths() {
      return files.filter((file) => file.viewed).map((file) => file.path);
    },
    softNavigations() {
      return softNavigations;
    },
  };
})();
